const express = require('express');
const app = express();
const path = require('path');

app.use(express.static('.'));

app.listen(process.env.PORT || 3000, () => {
  console.log('Server läuft');
});
