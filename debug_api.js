const http = require('http');

http.get('http://localhost:3000/api/items', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const items = JSON.parse(data);
      const clusterBeans = items.find(i => i.canonical_name === 'Cluster Beans');
      console.log('Cluster Beans:');
      console.log(JSON.stringify(clusterBeans.prices, null, 2));
      
      const beans = items.find(i => i.canonical_name === 'Beans');
      console.log('Beans:');
      console.log(JSON.stringify(beans.prices, null, 2));
    } catch(e) {
      console.error('Parse error:', e);
    }
  });
}).on('error', err => {
  console.log('Error: ', err.message);
});
