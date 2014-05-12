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
	"/js"
];

var bpath = process.cwd();

var isDev = process.platform === "darwin";

var css = fs.readFileSync(bpath + "/static/css");
var js = fs.readFileSync(bpath + "/static/js");

exports.handler = function ( request, response ) {
	var load;

	switch ( request.url ) {
		case "/css":
			load = isDev ? fs.readFileSync(bpath + "/static/css") : css;
			break;

		case "/js":
			response.writeHead(200, {
				"Content-type": "application/javascript; charset=utf8"
			})
			load = isDev ? fs.readFileSync(bpath + "/static/js") : js;
			break;

		default:
			response.writeHead(200, {
				Location: "/"
			});
	}

	return response.end(load);
}