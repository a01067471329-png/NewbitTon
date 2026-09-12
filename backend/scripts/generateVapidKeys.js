const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();
console.log('아래 값을 .env 파일에 붙여넣으세요:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
