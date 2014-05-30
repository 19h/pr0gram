var whirlpool = function (p) {
	return crypto.createHash("whirlpool").update(p).digest("hex");
};

var ripe = function (p) {
	return crypto.createHash("ripemd").update(p).digest("hex");
}

var _uuid = function () {
	var _seed = process.hrtime();
	_seed = _seed[0] + 1E9 * _seed[1];
	return Math.random() + _seed
};

var uuid = function () {
	return ripe(String(_uuid()));
}

var postIterator;

posts.getLast("all", function (a, b, v) {
	postIterator = (v|0) + 1
})

var health = {
/*	node: {
		uptime: XXX,
		channels: XXX,
		nick: XXX
	}
*/
};

exports.health = health;
exports.lastWrite = ~~(Date.now() / 1000);

var modules = {
	// Account
		hello: function (envelope, cb) {
			var host = envelope.payload.user.host;
			var nick = envelope.payload.user.nick.toLowerCase();
			var displayNick = envelope.payload.user.nick;

			return ref.get(host, function (err, _d) {
				// user doesn't exist
	 			if (err) {
					users.get(nick, function (err) {
						if (err) {
		 					return ref.put(host, nick, function () {
		 						var pwd = Math.random().toString(36).slice(-8);

		 						var _user = {
		 							host: host,
		 							nick: displayNick,
		 							key: whirlpool(pwd),
		 							since: Date.now()//,
		 							//posts: [],
		 							//likes: [],
		 							//comments: []
		 						}

		 						users.put(nick, _user, function () {
									return cb("Welcome to pr0gr.am, " + nick + ". Your password is: " + pwd + ".");
		 						})
		 					})
						} else {
							return cb("Nick is already taken.");
						}
					})
	 			} else {
	 				return cb("Hi " + _d);
	 			}
			})
		},
		resetpass: function (envelope, cb) {
			var host = envelope.payload.user.host;
			var nick = envelope.payload.user.nick;

			return ref.get(host, function (err, _d) {
				if (err) return cb("You're not registered, " + nick + ".");

				users.get(_d, function (err, user) {
					if (err) return cb("Something went wrong. Please contact apx.");

					var pwd = Math.random().toString(36).slice(-8);

					user.key = whirlpool(pwd);

					users.put(_d, user, function () {
						return cb("Successful. New password: " + pwd);
					})
				})
			});
		},
		changepass: function (envelope, cb) {
			var host = envelope.payload.user.host;
			var nick = envelope.payload.user.nick;

			return ref.get(host, function (err, _d) {
				if (err) return cb("You're not registered, " + nick + ".");

				users.get(_d, function (err, user) {
					if (err) return cb("Something went wrong. Please contact apx.");

					var msg = envelope.payload.text.split(" ");

					if ( msg.length !== 3 )
						return cb("Invalid arguments. Usage: changepass <new> <new>");

					if ( msg[1] !== msg[2] )
						return cb("Invalid conversation. Your password must match its validation.");

					user.key = whirlpool(msg[1]);

					users.put(_d, user, function () {
						return cb("Successful. New password: " + msg[1]);
					})
				})
			});
		},
		publickey: function (envelope, cb) {
			var host = envelope.payload.user.host;
			var nick = envelope.payload.user.nick;

			return ref.get(host, function (err, _d) {
				if (err) return cb("You're not registered, " + nick + ".");

				users.get(_d, function (err, user) {
					if (err) return cb("Something went wrong. Please contact apx.");

					var _default = function () {
						var pkey = Buffer(0),
						     sep = Buffer([ 0xff, 0xc0, 0xde ]);

						var privkey = Buffer.concat([
							sep,
							Buffer(_d),
							sep
						]);

						var offset = 512 - privkey.length;

						// there's a 16581375 to 1 chance we will have a collision to our seperator
						var challenge = crypto.randomBytes(offset);

						var wmark = Buffer([ 0x70, 0x72, 0x30, 0x67, 0x72, 0x61, 0x6d ]);
						var c = ((Math.random() * offset) + privkey.length - wmark.length)|0;
						for ( var i = 0; i < wmark.length; ++i ) challenge[c + i] = wmark[i];

						privkey = Buffer.concat([privkey, challenge]).toString("base64");

						var id = crypto.randomBytes(20).toString("hex");

						twofactor.put(id, privkey, function () {
							user.pkey = crypto.createHash("whirlpool").update(user.key).update(challenge).digest("base64");
							user.pkeydue = id;

							users.put(_d, user, function () {
								return cb("Successful. Download your public key: http://pr0gr.am/api/pkey/" + id);
							});
						});
					}

					if ( user.pkeydue ) {
						twofactor.del(user.pkeydue, _default);
					} else {
						_default();
					}
				})
			});
		},
	// Postings
		post: function (envelope, cb) {
			var host = envelope.envelope.user.host;
			var nick = envelope.envelope.user.nick.toLowerCase();
			var displayNick = envelope.envelope.user.nick;

			var _init = function (user) {
				var shortname;

				try {
					shortname = envelope.link.path.split("/").pop().split(".").shift();
				} catch(e) {
					return cb({}); // unknown error
				}

				var ext = envelope.link.href.split(".").pop();

				var image = uuid();
				var thumb = uuid();

				return request(envelope.link.href, {
					encoding: null
				}, function (error, response, body) {
					if (!error) {
						var source = process.cwd() + "/static/images/" + image + "." + ext;

						fs.writeFile(source, body, function (err) {
							if (err) return fs.unlink(source);

							eimg.info(process.cwd() + "/static/images/" + image + "." + ext, function (err, img) {
								if (err) return fs.unlink(source), cb({});

								if ( (img.width * img.height) > 64E6 ) { // 64E6 = 8k * 8k
									return fs.unlink(source), cb({});
										// Resolution too big.
								}

								ext = img.type.toLowerCase();

								var src = process.cwd() + "/static/images/" + image + "." + ext,
								    dst = process.cwd() + "/static/images/thumbs/" + thumb + "." + ext;

								var _default = function (src, removeSource) {
									fs.rename (source, process.cwd() + "/static/images/" + image + "." + ext, function () {
										eimg.thumbnail({
											src: src,
											dst: dst,
											width: 128, height: 128,
											x: 0, y: 0
										}, function (err) {
											if (err) return fs.unlink(source), fs.unlink(src), fs.unlink(process.cwd() + "/static/images/thumbs/" + thumb + "." + ext), cb({});

											// incase we used a temporary gif
											removeSource && fs.unlink(src);

											var itemId = postIterator++;

											db.put("\xFFposts\xFF" + image, itemId);
											db.put("\xFFposts\xFF" + user.nick + "\xFF" + itemId, "");

											user.name = user.nick;

											var hash = crypto.createHash("sha1").update(body).digest("hex");

											ref.get(hash, function (err, data) {
												if (err)
													return ref.put(hash, {
														id: itemId,
														keyword: image
													}, function (err) {
														posts.put("all", {
															user: user.nick,
															title: shortname,
															channel: {
																name: envelope.envelope.target
															},
															created: (Date.now()/1000)|0,
															image: image + "." + ext,
															thumb: thumb + "." + ext,
															source: envelope.link.href,
															type: "image",
															keyword: image,
															hash: hash
														}, { version: itemId }, function () {
															// OK, posted
														})
													});

												return cb({
													notice: "dup: http://pr0gr.am/#newest/*/" + data.id + "/" + data.keyword
												});
											})
										});
									});
								}

								if ( ext === "gif" ) {
									var tmpid = process.cwd() + "/static/images/" + uuid() + ".jpg";

									var convert = childProcess.spawn('convert', [source + '[0]', tmpid]);

									return convert.on('close', function (code) {
										_default (tmpid, true);
									});
								} else {
									return _default(src, false);
								}
							});
						});
					}
				})
			}

			return ref.get(host, function (err, _d) {
				if (err) return _init ({
					nick: nick
				});

				users.get(_d, function (err, user) {
					if (err) return _init ({
						nick: nick
					});

					return _init(user);
				});
			});
		},
		handshake: function (envelope, cb) {
			health[envelope.nick] = envelope;

			cb({
				status: "OK"
			})
		}
}

var server = net.createServer(function (sock) {
	var node;

	sock.on("data", function (data) {
		try {
			data = JSON.parse(data.toString())
		} catch(e) { return void 0 }

		if ( data.nodeName ) {
			node = data.nodeName;

			if ( !health[node] ) {
				health[node] = {
					nick: data.nodeName,
					channels: []
				}

				console.log("Bot online: " + data.nodeName);
			}
		}

		exports.lastWrite = ~~(Date.now() / 1000);

		if ( !data.payload.type || !modules[data.payload.type] )
			return sock.write(JSON.stringify({
				refKey: data.refKey,
				payload: {}
			}))

		return modules[data.payload.type](data.payload, function (payload) {
			return sock.write(JSON.stringify({
				refKey: data.refKey,
				payload: payload
			}));
		})
	});

	var _reset = function () {
		delete health[node];
	}

	sock.on("close", _reset);
	sock.on("timeout", _reset);
	sock.on("error", _reset);
	sock.on("disconnect", _reset);
});

server.listen(8124);