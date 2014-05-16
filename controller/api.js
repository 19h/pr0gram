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


// co / thunks. for use with yield
	
	/*
		try {
			var data = receivePost(request, response, 1024);

			// json or text
		} catch(e) {
			// non-post or too big
		}
	*/

	var receivePost = function (request, response, limit) {
		return function (cb) {
			if ( request.method !== "POST" )
				return cb(true, void 0);

			var res = Buffer(0), roadblock = false;

			request.on("data", function (chunk) {
				if (limit && res.length > limit) {
					roadblock = true;

					return cb(true, void 0);
				}

				res = Buffer.concat([res, chunk]);
			});

			request.on("end", function () {
				res = res.toString();

				try {
					cb(false, qs.parse(res));
				} catch(e) {
					cb(false, res);
				}
			});
		}
	};

	/*
		try {
			var data = receivePost(request, response, 1024);

			objAssert(data, [ "email", "password", "randomKey" ]);

			// everything is in data
		} catch(e) {
			// randomKey isn't in data
		}
	*/

	var objAssert = function (obj, arr) {
		return function (cb) {
			var lru;

			if (arr.some(function (v) { return !(obj[lru = v]) }))
				return cb(Error("Expecting argument: " + lru), void 0);
			else
				return cb(false, void 0);
		}
	}

var std = {
	success: Buffer('{"status":"success"}'),
	error: Buffer('{"status":"error"}')
};

var i = 0;

exports.handler = co(function *( request, response ) {
	try {
		if ( request.url === "/api/user/login.json" ) {
			if ( request.method === "POST" ) {
				var data = yield receivePost(request, response, 1024);

				try {
					yield objAssert(data, [
						"name", "password"
					]);
				} catch(e) {
					return loginResponse(false, request, response);
				}

				try {
					var _d = yield users.co.get(data.name);
				} catch(e) {
					return loginResponse(false, request, response)
				}
console.log(_d.key, whirlpool(data.password))
				if ( whirlpool(data.password) !== _d.key ) {
					return loginResponse(false, request, response);
				} else {
					response.writeHead(200, {
						"Set-Cookie": "me=" + encodeURIComponent(JSON.stringify({
							name: data.name,
							id: _d.nick,
							avatar: "tbi.jpg",
							admin: _d.admin
						})) + "; expires=Wed, 21-Feb-2024 21:37:16 GMT; path=/"
					});

					return request.session.set("authedAs", data.name, function () {
						return loginResponse(true, request, response);
					});
				}
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

		if ( !request.url.indexOf("/api/items/get.json") ) {
			var i = 0;

			var queries = qs.parse(request.url.split("/api/items/get.json")[1].substr(1));

			console.log(queries)

			var retval = {
				firstIndex: false,
				personalized: true,
				maxId: false,
				items: [],
				total: false,
				totalKnown: true
			};

			return posts.createVersionStream("all").on("data", function (post) {
				retval.total = retval.total + 1;

				if ( retval.firstIndex === false )
					retval.firstIndex = post.version;

				retval.maxId = post.version;

				post.value.index = post.version;
				post.value.id    = post.version;

				post.value.channel.keyword = "yolo";

				post.value.liked = false;

				post.value.user.name = post.value.user.nick;

				//post.value.image = "lawl.png";
				//post.value.thumb = "lawl.png";
				post.value.tags = [];

				retval.items.push(post.value);

				// return fs.createReadStream("./blob.json").pipe(response);
			}).on("end", function () {
				for ( var item in retval.items ) {
					if ( typeof retval.items[item].user !== "string" )
						break;

					retval.items[item].user = {
						name: retval.items[item].user
					};
				}

				response.end(JSON.stringify(retval))
			});
		}

		if ( !request.url.indexOf("/api/user/info.json?name=") ) {
			var user = request.url.substr(request.url.indexOf("name=") + 5);

			if ( !user || user.constructor !== String )
				return response.writeHead(404), response.end();

			user = user.toLowerCase();

			return users.get(user, function (err, _d) {
				if (err) return response.writeHead(404), response.end();

				var now = Date.now();

				var items = [];

				var buildResponse = function () {
					return response.end(JSON.stringify({
						user: {
							"name": _d.displayNick,
							"avatar": user + ".jpg",
							"registered": 1393205487193,
							"admin": _d.admin || false,
							"banned": _d.banned || false
						},
						comments: [],//_d.comments,
						commentCount: 0,//_d.comments.length,
						likes: [],//_d.likes,
						likeCount: 0,//_d.likes.length,
						uploads: items,//_d.posts,
						uploadCount: items.length,//_d.posts.length,
						tagCount: "∆",
						ts: now,
						cache: false,
						runtime: now - request.timing
					}));
				}

				posts.createReadStream({
					start: user,
					end: user + "\xFC"
				}).on("data", function (item) {
					items.push(item.key.split("\x1F").pop())
				}).on("end", co(function *() {
					for ( var item in items ) {
						var obj = (yield posts.co_getver("all", items[item])).shift();

						items[item] = {
							idx: obj.keyword,
							keyword: obj.keyword,
							thumb: obj.thumb
						};
					}

					buildResponse()
				}))
			});
		}

		return response.end(std.error);
	} catch (e) {
		if (!(e instanceof Error))
			if ( typeof e === "object" ) {
				e.message && (e.status = e.message);

				return response.end(JSON.stringify(e))
			}
		else
			if ( e.message )
				return response.end('{"status":"' + e.message + '"}')

		return response.end(std.error);
	}
});