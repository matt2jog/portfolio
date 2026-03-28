import Jimp from 'jimp';

async function cropSnake() {
  try {
    const imagePath = 'C:\\Users\\matth\\.gemini\\antigravity\\brain\\c451656c-253d-485f-83d5-9400a3ed0090\\media__1774721282129.jpg';
    const image = await Jimp.read(imagePath);
    
    // The image is a standard smartphone snapshot of a card.
    // The logo is roughly in the top middle of the card.
    // Assuming standard portrait photo dimensions (e.g. 1080x1920 or similar).
    // Let's do a central crop.
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    // crop(x, y, w, h)
    // Logo is likely in the top 30-50% area, centered.
    // Let's crop relative to the image size.
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
