/*
	 ___ ____ __ __
	/ _ `/ _ \\ \ /
	\_,_/ .__/_\_\ 
	   /_/ 
	
	過去は未来によって変えられる。
*/

exports.name = "api";
exports.paths = [
	"/api"
];

// Generics
	var whirlpool = function (p) {
		return crypto.createHash("whirlpool").update(p).digest("hex");
	}

	var receive = function ( request, response, cb ) {
		var res = "";

		request.on("data", function (data) {
			if ( res.length > 2048 )
				return response.end("");

			res += data;
		});

		return request.on("end", function () {
			res = qs.parse(res);

			cb(res)
		});
	}

// LOGIN
	var loginResponse = function (success, request, response) {
		var now = Date.now();

		return response.end(JSON.stringify({
			success: success,
			ts: now,
			cache: false,
			runtime: now - request.timing
		}))
	}

exports.handler = function ( request, response ) {
	if ( request.url === "/api/user/login.json" ) {
		if ( request.method === "POST" ) {
			receive(request, response, function (data) {
				if ( !data.name || !data.password )
					return loginResponse(false, request, response);

				users.get(data.name, function (err, _d) {
					if ( err ) return loginResponse(false, request, response);

					if ( whirlpool(data.password) !== _d.key ) {
						return loginResponse(false, request, response);
					} else {
						response.writeHead(200, {
							"Set-Cookie": "me=" + encodeURIComponent(JSON.stringify({
								name: data.name,
								id: "idsarebullshit",
								avatar: "tbi.jpg",
								admin: _d.admin
							})) + "; expires=Wed, 21-Feb-2024 21:37:16 GMT; path=/"
						});

						return request.session.set("authedAs", data.name, function () {
							return loginResponse(true, request, response);
						});
					}
				});
			})
		} else {
			return loginResponse(false, request, response);
		}
	}

	if ( request.url === "/api/user/logout.json" ) {
		return request.session.destroy(function () {
			return loginResponse(true, request, response);
		})
	}

	if ( request.url === "/api/status.json" ) {
		return response.end(JSON.stringify({
			online: true,
			lastWrite: logic.bot.lastWrite,
			uptime: process.uptime(),
			instances: Object.keys(logic.bot.health).map(function (i) {
				return logic.bot.health[i]
			})
		}));
	}

	if ( !request.url.indexOf("/api/user/info.json?name=") ) {
		var user = request.url.substr(request.url.indexOf("name=") + 5);

		if ( !user || user.constructor !== String )
			return response.writeHead(404), response.end();

		user = user.toLowerCase();

		return users.get(user, function (err, _d) {
			if (err) return response.writeHead(404), response.end();

			var now = Date.now();

			return response.end(JSON.stringify({
				user: {
					"name": _d.displayNick,
					"avatar": user + ".jpg",
					"registered": 1393205487193,
					"admin": _d.admin || false,
					"banned": _d.banned || false
				},
				comments: _d.comments,
				commentCount: _d.comments.length,
				likes: _d.likes,
				likeCount: _d.likes.length,
				uploads: _d.posts,
				uploadCount: _d.posts.length,
				tagCount: "∆",
				ts: now,
				cache: false,
				runtime: now - request.timing
			}));
		});
	}
}