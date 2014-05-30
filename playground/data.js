var crypto = require("crypto"),
        fs = require("fs");

var key = crypto.createHash("whirlpool").update("key").digest();

var pkey = Buffer(0),
     sep = Buffer([ 0xff, 0xc0, 0xde ]);

var user = "apx";

var privkey = Buffer.concat([
	sep,
	Buffer(user),
	sep
]);

var offset = 512 - privkey.length;

// there's a 16581375 to 1 chance we will have a collision to our seperator
var challenge = crypto.randomBytes(offset);

var wmark = Buffer([ 0x70, 0x72, 0x30, 0x67, 0x72, 0x61, 0x6d ]);
var c = ((Math.random() * offset) + privkey.length - wmark.length)|0;
for ( var i = 0; i < wmark.length; ++i ) challenge[c + i] = wmark[i];

privkey = Buffer.concat([privkey, challenge]);

fs.writeFileSync(
	"test.pub",
	privkey
);

var secret = crypto.createHash("whirlpool").update(key).update(challenge).digest();

console.log(secret)