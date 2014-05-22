/*
	 ___ ____ __ __
	/ _ `/ _ \\ \ /
	\_,_/ .__/_\_\ 
	   /_/ 
	
	過去は未来によって変えられる。
*/

exports.name = "resources";
exports.paths = [
	"/css",
	"/js",
	"/jsx"
];

var bpath = process.cwd();

var gKey = require("crypto").randomBytes(32).toString("hex");
var GC = fs.readFileSync(bpath + "/static/gCrypto.js");
var gCrypto = function (payload) {
	return GC.toString()
		.split("#key#").join(gKey)
		.split("#target").join(gAES.enc(payload, gKey));
}

var isDev = "dev" in process.env || process.platform === "darwin";

var css = fs.readFileSync(bpath + "/static/css");
var js = fs.readFileSync(bpath + "/static/js");

var licHead = fs.readFileSync(bpath + "/static/lic-head");

if ( !isDev ) {
	var uglify = require("uglifyjs");

	js = Buffer(uglify.minify(js.toString(), { fromString: true, hoist_vars: true }).code.split("\n").join(""));
	//js = gCrypto(licHead + js + spl);
}

var toBA = function (str) {
	if(!str) return [];
	str = str.split("").reverse().join("");

	var y = [];

	for (var i = 0; i < (~~(str.length/3) + 1); ++i) {
		var c = 0x0;

		for (var j = 0; j < 3; ++j) {
			var p = j + (i * 3);

			if (str[p] === void 0) break;

			c <<= 8; c ^= str[p].charCodeAt(0) & 0xFF;
		}

		c !== 0x0 && y.unshift("0x" + c.toString(16))
	}

	return y
}

var sBA = toBA([
	"(c)",
	" ___ ____ __ __",
	"/ _ `/ _ \\\\ \\ /",
	"\\_,_/ .__/_\\_\\ ",
	"   /_/ "
].join("\n"));

var spl = "setTimeout(console.log.bind(console), 50, (function (x) {for (var z = \"\", n = 0, _ = 0, __; n < x.length; ++n, _ = 0, __)while(_ !== 3) (__ = (x[n] >> (_++ * 8)) & 0xFF), __ !== 0 && (z += String.fromCharCode(__)); return z})([" + sBA + "]));"

exports.handler = function ( request, response ) {
	var load;

	switch ( request.url ) {
		case "/css":
			load = isDev ? fs.readFileSync(bpath + "/static/css") : css;
			load = licHead + load;
			break;

		case "/js":
			response.writeHead(200, {
				"Content-type": "application/javascript; charset=utf8"
			})
			load = isDev ? fs.readFileSync(bpath + "/static/js") : js;
			load = licHead + load + spl;
			break;

		default:
			response.writeHead(200, {
				Location: "/"
			});
	}

	return response.end(load);
}
