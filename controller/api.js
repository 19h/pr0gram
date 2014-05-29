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

	var co_delVersion = function (db, key, ver) {
		return function (cb) {
			db.del(key, {
				version: ver
			}, function (err) {
				cb(err)
			})
		}
	}

	var co_delVersionGlobal = function (db, key, ver) {
		return function (cb) {
			db.del(key, function (err) {
				cb(err)
			})
		}
	}

	var collectComments = function (id) {
		return function (cb) {
			var comments = [];

			return vref.createVersionStream(id + "\xFFcomments", {
				reverse: true
			})
			.on("data", function (item) {
				item.value.id = item.version;
				item.value.root = ~config.roots.indexOf(item.value.user) ? true : false;
				item.value.admin = ~config.admins.indexOf(item.value.user) ? true : ( item.value.root || false );
				item.value.name = item.value.user;
				delete item.value.user;
				comments.push(item.value);
			}).on("end", co(function *() {
				cb(false, comments);
			}));
		}
	}

	var collectTags = function (id) {
		return function (cb) {
			var tags = [];

			return vref.createVersionStream(id + "\xFFtags", {
				reverse: true
			})
			.on("data", function (item) {
				item.value.id = item.version;
				item.value.name = item.value.user;
				item.value.tag = item.value.content;
				delete item.value.user;
				delete item.value.content;
				tags.push(item.value);
			}).on("end", co(function *() {
				cb(false, tags);
			}));
		}
	}

	var userCollectComments = function (id, opts) {
		return function (cb) {
			var comments = [];

			return vref.createVersionStream(id + "\xFFcomments", opts)
			.on("data", function (item) {
				comments.push(item.value)
			}).on("end", co(function *() {
				cb(false, comments);
			}));
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

				data.name = String(data.name).toLowerCase();

				try {
					var _d = yield users.co.get(data.name);
				} catch(e) {
					return loginResponse(false, request, response)
				}

				_d.root = ~config.roots.indexOf(data.name) ? true : false;
				_d.admin = ~config.admins.indexOf(data.name) ? true : ( _d.root || false );

				if ( whirlpool(data.password) !== _d.key ) {
					return loginResponse(false, request, response);
				} else {
					response.writeHead(200, {
						"Set-Cookie": "me=" + encodeURIComponent(JSON.stringify({
							name: data.name,
							id: _d.nick,
							admin: _d.admin
						})) + "; expires=Wed, 21-Feb-2024 21:37:16 GMT; path=/"
					});

					return request.session.set("gwAuthed", data.name, function () {
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

			var data = qs.parse(request.url.split("/api/items/get.json")[1].substr(1));

			yield objAssert(data, [
				"q", "sort", "count"
			]);

			if ( !isNaN(data.count) ) {
				var count = data.count | 0;

				if ( (count & 0xFF) !== count )
					count = 255;
			} else {
				throw {
					status: "Assertion error: typeof amount !== 'number(value)'"
				}
			}

			return request.session.get("gwAuthed", co(function *(err, gwAuthed) {
				var authed = !err && gwAuthed;

				var retval = {
					firstIndex: false,
					personalized: authed,
					maxId: false,
					items: [],
					total: false,
					totalKnown: true
				};

				if ( data.q === "*" ) {
					var pI = 0;

					return posts.createVersionStream("all", {
						limit: count
					}).on("data", function (post) {
						retval.total = retval.total + 1;

						if ( retval.firstIndex === false )
							retval.firstIndex = post.version;

						retval.maxId = post.version;

						post.value.index = ++pI;
						post.value.id    = post.version;

						post.value.channel.keyword = "yolo";
						post.value.liked = false;
						post.value.user.name = post.value.user.nick;
						post.value.tags = [];

						retval.items.push(post.value);
					}).on("end", co(function *() {
						for ( var item in retval.items ) {

							retval.items[item].user = {
								name: retval.items[item].user
							};

							retval.items[item].user.root = ~config.roots.indexOf(retval.items[item].user.name) ? true : false;
							retval.items[item].user.admin = ~config.admins.indexOf(retval.items[item].user.name) ? true : ( retval.items[item].user.root || false );

							var liked = false;

							if ( authed ) {
								try {
									liked = yield ref.co.get(gwAuthed+"\xFFlikes\xFF"+retval.items[item].id);

									liked = liked === "" ? true : false;
								} catch(e) {}
							}

							retval.items[item].comments = yield collectComments(retval.items[item].id);
							retval.items[item].commentCount = retval.items[item].comments.length;

							retval.items[item].tags = yield collectTags(retval.items[item].id);
							retval.items[item].tagCount = retval.items[item].tags.length;

							retval.items[item].liked = liked;
						}

						response.end(JSON.stringify(retval))
					}));
				}

				if ( data.q.split(":")[0] === "uploads" ) {
					try {
						var user = data.q.split(":")[1];

						var _d = yield users.co.get(user);

						return db.createKeyStream({
							start: "\xFFposts\xFF" + user,
							end: "\xFFposts\xFF" + user + "\u9999"
						}).on("data", function (item) {
							var tVer = item.split("\xFF").pop() | 0;

							retval.total = retval.total + 1;

							if ( retval.firstIndex === false )
								retval.firstIndex = tVer;

							retval.maxId = tVer;

							retval.items.push(item.split("\xFF").pop())
						}).on("end", co(function *() {
							for ( var item in retval.items ) {
								var xitm = yield posts.co_getver("all", retval.items[item]);
								var itm = xitm.shift();

								var ver = xitm.shift() | 0;

								//if ( typeof itm.user !== "string" )
								//	continue;

								itm.index = ver;
								itm.id    = ver;

								itm.channel.keyword = "yolo";

								itm.user.name = itm.user.nick;

								itm.user = {
									name: itm.user
								};

								itm.user.root = ~config.roots.indexOf(itm.user.name) ? true : false;
								itm.user.admin = ~config.admins.indexOf(itm.user.name) ? true : ( itm.user.root || false );

								var liked = false;

								if ( authed ) {
									try {
										liked = yield ref.co.get(gwAuthed+"\xFFlikes\xFF"+itm.id);

										liked = liked === "" ? true : false;
									} catch(e) {}
								}

								itm.comments = yield collectComments(itm.id);
								itm.commentCount = itm.comments.length;

								itm.tags = yield collectTags(itm.id);
								itm.tagCount = itm.tags.length;

								itm.liked = liked;

								retval.items[item] = itm;
							}

							response.end(JSON.stringify(retval))
						}));
					} catch(e) { return response.end(e.stack) }
				}
			}));
		}

		if ( request.url === "/api/items/like.json" ) {
			var data = yield receivePost(request, response, 1024);

			yield objAssert(data, [
				"id"
			]);

			data.id = ~~data.id;

			if ( isNaN(data.id) ) {
				throw {
					status: "Item does not exist"
				}
			}

			try {
				var gwAuthed = yield request.session.co_get("gwAuthed");

				if ( !gwAuthed ) throw 0;
			} catch(e) {
				throw {
					status: "Unauthorized"
				}
			}

			try {
				var item = yield posts.co_getver("all", data.id);

				yield ref.co.put(gwAuthed+"\xFFlikes\xFF"+data.id, "");

				return response.end(std.success);
			} catch(e) {
				throw {
					status: "Item does not exist"
				}
			}
		}

		if ( request.url === "/api/items/unlike.json" ) {
			var data = yield receivePost(request, response, 1024);

			yield objAssert(data, [
				"id"
			]);

			data.id = ~~data.id;

			if ( isNaN(data.id) ) {
				throw {
					status: "Item does not exist"
				}
			}

			try {
				var gwAuthed = yield request.session.co_get("gwAuthed");

				if ( !gwAuthed ) throw 0;
			} catch(e) {
				throw {
					status: "Unauthorized"
				}
			}

			try {
				var item = yield posts.co_getver("all", data.id);

				yield ref.co.del(gwAuthed+"\xFFlikes\xFF"+data.id, "");

				return response.end(std.success);
			} catch(e) {
				throw {
					status: "Item does not exist"
				}
			}
		}

		if ( !request.url.indexOf("/api/comments/get.json") ) {
			var data = qs.parse(request.url.split("/api/comments/get.json")[1].substr(1));

			yield objAssert(data, [
				"id"
			]);

			data.id = ~~data.id;

			if ( isNaN(data.id) ) {
				throw {
					status: "Item does not exist"
				}
			}

			try {
				var item = yield posts.co_getver("all", data.id);

				var comments = yield collectComments(data.id)

				response.end(JSON.stringify({
					personalized: true,
					comments: comments,
					commentCount: comments.length
				}))

				return response.end(std.success);
			} catch(e) {
				response.end(JSON.stringify({
					personalized: true,
					comments: [],
					commentCount: 0
				}))
			}
		}

		if ( !request.url.indexOf("/api/comments/post.json") ) {
			var data = yield receivePost(request, response, 1024);

			yield objAssert(data, [
				"id", "comment"
			]);

			data.id = ~~data.id;

			if ( isNaN(data.id) ) {
				throw {
					status: "Item does not exist"
				}
			}

			if ( !data.comment )
				throw {
					status: "Comment has to have content"
				}

			try {
				var gwAuthed = yield request.session.co_get("gwAuthed");

				if ( !gwAuthed ) throw 0;
			} catch(e) {
				throw {
					status: "Unauthorized"
				}
			}

			try {
				var item = yield posts.co_getver("all", data.id);

				return vref.put(data.id+"\xFFcomments", {
					created: (Date.now() / 1000) | 0,
					content: data.comment,
					user: gwAuthed
				}, function () {
					return vref.put(gwAuthed+"\xFFcomments", {
						id: data.id,
						keyword: item.keyword,
						created: (Date.now() / 1000) | 0,
						content: data.comment
					}, function () {
						return response.end(std.success);
					});
				});
			} catch(e) {
				throw {
					status: "Item does not exist"
				}
			}
		}

		if ( !request.url.indexOf("/api/comments/delete.json") ) {
			var data = yield receivePost(request, response, 1024);

			yield objAssert(data, [
				"id"
			]);

			data.id = ~~data.id;

			if ( isNaN(data.id) ) {
				throw {
					status: "Item does not exist"
				}
			}

			try {
				var gwAuthed = yield request.session.co_get("gwAuthed");

				if ( !gwAuthed ) throw 0;
			} catch(e) {
				throw {
					status: "Unauthorized"
				}
			}

			try {
				var item = yield posts.co_getver("all", data.id);

				return vref.del(data.id+"\xFFcomments", {

				}, function () {
					return response.end(std.success);
				});
			} catch(e) {
				throw {
					status: "Item does not exist"
				}
			}
		}

		if ( !request.url.indexOf("/api/tags/add.json") ) {
			var data = yield receivePost(request, response, 1024);

			yield objAssert(data, [
				"id", "tags"
			]);

			data.id = ~~data.id;

			if ( isNaN(data.id) ) {
				throw {
					status: "Item does not exist"
				}
			}

			if ( !data.tags )
				throw {
					status: "Tag has to have content"
				}

			try {
				var gwAuthed = yield request.session.co_get("gwAuthed");

				if ( !gwAuthed ) throw 0;
			} catch(e) {
				throw {
					status: "Unauthorized"
				}
			}

			data.tags = data.tags.split(" ").filter(function (v) {
				return v.length < 100
			});

			if ( !data.tags.length )
				throw {
					status: "Tags may be too long"
				}

			try {
				var item = yield posts.co_getver("all", data.id);

				var n = data.tags.length, i = 0;

				return data.tags.forEach(function (tag) {
					return vref.put(data.id+"\xFFtags", {
						created: (Date.now() / 1000) | 0,
						content: tag,
						user: gwAuthed
					}, function () {
						return ++i === data.tags.length && response.end(std.success);
					});
				});
			} catch(e) {
				throw {
					status: "Item does not exist"
				}
			}
		}

		if ( !request.url.indexOf("/api/tags/delete.json") ) {
			var query = qs.parse(request.url.split("/api/tags/delete.json")[1].substr(1));
			var data = yield receivePost(request, response, 1024);

			yield objAssert(query, [
				"id"
			]);

			query.id = ~~query.id;

			if ( isNaN(query.id) ) {
				throw {
					status: "Item does not exist"
				}
			}

			try {
				var gwAuthed = yield request.session.co_get("gwAuthed");

				if ( !gwAuthed ) throw 0;
			} catch(e) {
				throw {
					status: "Unauthorized"
				}
			}

			data = Object.keys(data).filter(function (v) {
				return !v.indexOf("tag_")
			}).map(function (v) {
				return v.split("_").pop()
			});

			if ( Object.keys(data).length === 0 ) throw 0;

			try {
				var item = yield posts.co_getver("all", query.id);

				var n = data.length, i = 0;

				return data.forEach(function (tag) {
					return vref.del(query.id + "\xFFtags", {
						version: tag
					}, function (err) {
						return ++i === data.length && response.end(std.success);
					});
				});
			} catch(e) {
				throw {
					status: "Item does not exist"
				}
			}
		}

		if ( !request.url.indexOf("/api/items/delete.json") ) {
			var data = yield receivePost(request, response, 1024);

			yield objAssert(data, [
				"id"
			]);

			throw {
				status: "Item deletion currently disabled"
			};

			data.id = ~~data.id;

			if ( isNaN(data.id) ) {
				throw {
					status: "Item does not exist"
				}
			}

			try {
				var gwAuthed = yield request.session.co_get("gwAuthed");

				if ( !gwAuthed ) throw 0;
			} catch(e) {
				throw {
					status: "Unauthorized"
				}
			}

			try {
				var item = yield posts.co_getver("all", data.id);

				yield co_delVersionGlobal(vref, data.id + "\xFFtags");
				yield co_delVersionGlobal(vref, data.id + "\xFFcomments");
				yield co_delVersion(posts, "all", data.id);

				try {
					fs.unlinkSync(process.cwd() + "/static/images/thumbs/" + item.thumb);
				} catch(e) {}

				try {
					fs.unlinkSync(process.cwd() + "/static/images/" + item.keyword);
				} catch(e) {}

			} catch(e) {
				throw {
					status: "Item does not exist"
				}
			}
		}

		if ( !request.url.indexOf("/api/tags/get.json") ) {
			var data = qs.parse(request.url.split("/api/tags/get.json")[1].substr(1));

			yield objAssert(data, [
				"id"
			]);

			data.id = ~~data.id;

			if ( isNaN(data.id) ) {
				throw {
					status: "Item does not exist"
				}
			}

			try {
				var gwAuthed = yield request.session.co_get("gwAuthed");

				if ( !gwAuthed ) throw 0;
			} catch(e) {
				throw {
					status: "Unauthorized"
				}
			}

			try {
				var item = yield posts.co_getver("all", data.id);

				var tags = yield collectTags(data.id);

				return response.end(JSON.stringify({
					tags: tags,
					tagCount: tags.length
				}))
			} catch(e) {
				throw {
					status: "Item does not exist"
				}
			}
		}

		if ( !request.url.indexOf("/api/user/info.json") ) {
			var data = qs.parse(request.url.split("/api/user/info.json")[1].substr(1));

			yield objAssert(data, [
				"name"
			]);

			var user = data.name;

			if ( !user || user.constructor !== String )
				return response.writeHead(404), response.end();

			user = user.toLowerCase();

			return users.get(user, function (err, _d) {
				if (err) return response.writeHead(404), response.end();

				var now = Date.now(), items = [], likes = [], comments = [];

				_d.root = ~config.roots.indexOf(user) ? true : false;
				_d.admin = ~config.admins.indexOf(user) ? true : ( _d.root || false );

				var buildResponse = co(function *() {
					comments = yield userCollectComments(user);
					
					for ( var comment in comments ) {
						try {
							var item = yield posts.co_getver("all", comments[comment].id);

							comments[comment] = {
								title: item[0].title,
								keyword: item[0].keyword,
								idx: item[1],
								created: comments[comment].created,
								content: comments[comment].content
							}
						} catch(e) {}
					}

					return response.end(JSON.stringify({
						user: {
							name: _d.nick,
							registered: _d.since,
							admin: _d.admin,
							root: _d.root,
							banned: _d.banned || false
						},
						comments: comments.slice(0, 5),
						commentCount: comments.length,
						likes: likes,
						likeCount: likes.length,
						uploads: items,
						uploadCount: items.length,
						tagCount: "∆",
						ts: now,
						cache: false,
						runtime: now - request.timing
					}));
				})

				db.createReadStream({
					start: "\xFFposts\xFF" + user,
					end: "\xFFposts\xFF" + user + "\u9999"
				}).on("data", function (item) {
					items.push(item.key.split("\xFF").pop())
				}).on("end", co(function *() {
					for ( var item in items ) {
						try {
							var itm = yield posts.co_getver("all", items[item]);
							
							var obj = (itm).shift();

							items[item] = {
								idx: itm.shift(),
								keyword: obj.keyword,
								thumb: obj.thumb
							};
						} catch(e) { // item was deleted
							yield co_delVersionGlobal(posts, "all", user + "\xFF" + item);
							delete items[item];

							items[item] = items.filter(function (item) {
								return item;
							}); // rebuild items
						}
					}

					return ref.createReadStream({
						start: user + "\xFFlikes",
						end: user + "\xFFlikes\u9999",
						reverse: true
					}).on("data", function (item) {
						likes.push(item.key.split("\xFF").pop())
					}).on("end", co(function *() {
						for ( var like in likes ) {
							try {
								var itm = yield posts.co_getver("all", likes[like]);

								var obj = (itm).shift();

								likes[like] = {
									idx: itm.shift(),
									keyword: obj.keyword,
									thumb: obj.thumb
								};
							} catch(e) { // item was deleted
								yield co_delVersionGlobal(ref, user + "\xFFlikes\xFF" + like);
								delete likes[like];

								likes = likes.filter(function (like) {
									return like;
								}); // rebuild likes
							}
						}

						buildResponse()
					}));
				}))
			});
		}

		return response.end(std.error);
	} catch (e) {
		if (e instanceof Error) {
			if ( e.message )
				return response.end('{"status":"' + e.message + '"}')
		} else {
			if ( typeof e === "object" ) {
				e.message && (e.status = e.message);

				return response.end(JSON.stringify(e))
			}
		}

		return response.end(std.error);
	}
});
