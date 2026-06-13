const { join } = require('path');

module.exports = {
  // Chrome se instala DENTRO del proyecto, no en la carpeta del usuario de Windows
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};