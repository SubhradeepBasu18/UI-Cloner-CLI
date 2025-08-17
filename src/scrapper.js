import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import beautify from 'js-beautify';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Utility to sanitize filenames by removing invalid characters
function sanitizeFilename(filename) {
  return filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
}

// Generate a unique filename with hash to prevent collisions
function generateUniqueFilename(url, content) {
  const urlObj = new URL(url);
  const ext = path.extname(urlObj.pathname) || '.jpg';
  const hash = require('crypto').createHash('md5').update(url).digest('hex').substring(0, 8);
  const baseName = path.basename(urlObj.pathname, ext) || 'image';
  return `${baseName}-${hash}${ext}`.replace(/[^\w.-]/g, '_');
}

// Download asset (image) from URL and save locally
async function downloadAsset(url, folderPath) {
  try {
    // Extract filename from URL, handle query parameters
    const urlObj = new URL(url);
    let filename = path.basename(urlObj.pathname);
    
    // If no extension, try to determine from content type
    if (!path.extname(filename)) {
      const response = await axios.head(url);
      const contentType = response.headers['content-type'];
      if (contentType) {
        const ext = contentType.split('/').pop();
        filename = `${filename}.${ext}`;
      } else {
        filename = `${filename}.jpg`; // default fallback
      }
    }
    
    // Create folder if it doesn't exist
    await fs.mkdir(folderPath, { recursive: true });
    
    const destPath = path.join(folderPath, filename);
    const writer = fs.createWriteStream(destPath);
    
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream'
    });
    
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`✅ Downloaded: ${filename}`);
        resolve(filename);
      });
      writer.on('error', (err) => {
        console.error(`❌ Failed to download ${url}:`, err.message);
        reject(err);
      });
    });
  } catch (err) {
    console.error(`❌ Error downloading ${url}:`, err.message);
    throw err;
  }
}

async function scrapeAndFormat(url, customFolderName) {
  let browser;
  try {
    const origin = new URL(url);
    const folderName = customFolderName
      ? customFolderName
      : `cloned-${origin.hostname.replace(/\./g, '-')}`;
    
    const folderPath = path.resolve(__dirname, folderName);
    await fs.mkdir(folderPath, { recursive: true });

    browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Use setTimeout fallback instead of page.waitForTimeout
    await new Promise(resolve => setTimeout(resolve, 2000));

    const htmlContent = await page.content();
    await browser.close();

    const $ = cheerio.load(htmlContent);

    let cssLinks = [];
    $('link[rel="stylesheet"]').each((_, link) => {
      const href = $(link).attr('href');
      if (href) cssLinks.push(href.startsWith('http') ? href : new URL(href, url).href);
    });

    let jsLinks = [];
    $('script').each((_, script) => {
      const src = $(script).attr('src');
      if (src) jsLinks.push(src.startsWith('http') ? src : new URL(src, url).href);
    });

    $('link[rel="stylesheet"]').remove();
    $('script').remove();

    let allCss = '';
    for (const cssUrl of cssLinks) {
      try {
        const cssContent = await axios.get(cssUrl).then((response) => response.data);
        allCss += cssContent;
      } catch (error) {
        console.log(`Error fetching CSS from ${cssUrl}:`, error);
      }
    }

    $('head').append('<link rel="stylesheet" href="style.css">');

    let allJs = '';
    for (const jsUrl of jsLinks) {
      try {
        const jsContent = await axios.get(jsUrl).then((response) => response.data);
        allJs += jsContent;
      } catch (error) {
        console.log(`Error fetching JS from ${jsUrl}:`, error);
      }
    }

    // Handle inline style background images
    const styleElems = $('[style]').toArray();
    for (const el of styleElems) {
      const style = $(el).attr('style');
      const regex = /background(?:-image)?:.*url\(["']?(.*?)["']?\)/;
      const match = regex.exec(style);
      if (match && match[1] && !match[1].startsWith('data:image/')) {
        let bgUrl = match[1].startsWith('http') ? match[1] : new URL(match[1], url).href;
        try {
          const imgName = path.basename(new URL(bgUrl).pathname);
          const imgPath = path.join(folderName, imgName);
          const success = await downloadAsset(bgUrl, imgPath);
          if (success) {
            $(el).attr(
              'style',
              style.replace(match[1], imgName)
            );
          }
        } catch (error) {
          console.log(`Failed to process background image: ${bgUrl}`, error);
        }
      }
    }

    // Create images directory
    const imagesDir = path.join(folderPath, 'images');
    await fs.mkdir(imagesDir, { recursive: true });

    // Handle <img> tags
    const imgTags = $('img');
    for (let i = 0; i < imgTags.length; ++i) {
      const img = imgTags[i];
      let src =
        $(img).attr('src') ||
        $(img).attr('data-src') ||
        $(img).attr('data-lazy') ||
        $(img).attr('data-original');
      
      if (!src || src.startsWith('data:image/')) continue;
      
      try {
        // Handle relative URLs
        const absUrl = src.startsWith('http') ? src : new URL(src, url).href;
        
        // Download the image
        const imgName = await downloadAsset(absUrl, imagesDir);
        
        // Update the src to point to the local image
        if (imgName) {
          const relativePath = path.join('images', imgName).replace(/\\/g, '/');
          $(img).attr('src', relativePath);
          
          // Clean up other attributes
          ['data-src', 'data-lazy', 'data-original'].forEach(attr => {
            if ($(img).attr(attr)) {
              $(img).removeAttr(attr);
            }
          });
        }
      } catch (error) {
        console.error(`❌ Failed to process image ${src}:`, error.message);
      }
    }

    // Handle background images in CSS
    const urlRegex = /url\(["']?(.*?)["']?\)/g;
    const cssImageLinks = [...allCss.matchAll(urlRegex)].map(match => match[1]);
    for (const cssImgUrl of cssImageLinks) {
      if (!cssImgUrl || cssImgUrl.startsWith('data:image/')) continue;
      const fullUrl = cssImgUrl.startsWith('http') ? cssImgUrl : new URL(cssImgUrl, url).href;
      try {
        const imgName = path.basename(new URL(fullUrl).pathname);
        const imgPath = path.join(folderName, imgName);
        const success = await downloadAsset(fullUrl, imgPath);
        if (success) {
          allCss = allCss.replace(
            new RegExp(cssImgUrl.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'),
            imgName
          );
        }
      } catch (error) {
        console.log(`Failed to process CSS image: ${fullUrl}`, error);
      }
    }

    const beautifiedHtml = beautify.html($.html(), { indent_size: 2 });
    const beautifiedCss = beautify.css(allCss, { indent_size: 2 });
    const beautifiedJs = beautify.js(allJs, { indent_size: 2 });

    await fs.writeFile(path.join(folderPath, 'index.html'), beautifiedHtml);
    await fs.writeFile(path.join(folderPath, 'style.css'), beautifiedCss);
    await fs.writeFile(path.join(folderPath, 'script.js'), beautifiedJs);

    return `Successfully cloned and saved files to ${folderName}`;
  } catch (error) {
    return `Error in cloning: ${error.message}`;
  }
}

export { scrapeAndFormat };
