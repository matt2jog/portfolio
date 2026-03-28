const Jimp = require('jimp');

async function cropSnake() {
  try {
    const imagePath = 'C:\\Users\\matth\\.gemini\\antigravity\\brain\\c451656c-253d-485f-83d5-9400a3ed0090\\media__1774721282129.jpg';
    const image = await Jimp.read(imagePath);
    
    // The image is a standard smartphone snapshot of a card.
    // The logo is roughly in the top middle of the card.
    // Setting an approximate crop box for the logo.
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    const cropW = Math.floor(width * 0.7);
    const cropH = Math.floor(height * 0.3);
    const cropX = Math.floor(width * 0.15);
    const cropY = Math.floor(height * 0.25);
    
    image.crop(cropX, cropY, cropW, cropH);
    await image.writeAsync('client/public/logo-snake.png');
    console.log('Successfully extracted snake logo based on relative coordinates.');
  } catch (err) {
    console.error('Error cropping image:', err);
  }
}

cropSnake();
