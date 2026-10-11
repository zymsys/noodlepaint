import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Users/vic/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',headless:true});
const page=await browser.newPage();
for(const size of [180,192,512]){await page.setViewportSize({width:size,height:size});await page.setContent(`<style>body{margin:0}</style><svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="#edeaf5"/><path d="M144 165 C174 175 185 341 245 338 C290 335 322 165 369 169" stroke="#217a71" stroke-width="42" stroke-linecap="round" fill="none"/><circle cx="369" cy="169" r="45" fill="none" stroke="#fcfbff" stroke-width="15"/><circle cx="369" cy="169" r="45" fill="none" stroke="#293355" stroke-width="5"/><circle cx="369" cy="169" r="5" fill="#293355"/></svg>`);await page.screenshot({path:`public/icon-${size}.png`});}
await browser.close();
