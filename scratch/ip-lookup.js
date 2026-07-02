const https = require('https');

https.get('https://ipinfo.io/2406:da1c:4c7:f802:ac24:d08a:807d:b2b4/json', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
}).on('error', console.error);
