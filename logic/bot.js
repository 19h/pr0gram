var whirlpool = function (p) {
	return crypto.createHash("whirlpool").update(p).digest("hex");
};

var ripe = function (p) {
	return crypto.createHash("ripemd").update(p).digest("hex");
}

var _cropImage_stream = function(streamIn, w, h) {
        var command = 'convert';

        var args = [
                "-", // use stdin
                "-resize", w + "x", // resize width to 640
                "-gravity", "center", // sets the offset to the center
                "-crop", w + "x" + h + "+0+0", // crop
                "+repage", // reset the virtual canvas meta-data from the images.
                "-" // output to stdout
        ];

        var proc = childProcess.spawn(command, args);

        var stream = new Stream();

        proc.stderr.on('data', new Function("return true"));
        proc.stdout.on('data', stream.emit.bind(stream, 'data'));
        proc.stdout.on('end', stream.emit.bind(stream, 'end'));
        proc.on('error', new Function("return true"));

        if (streamIn instanceof Buffer) {
                proc.stdin.write(streamIn);
                proc.stdin.emit("end");
        } else {
                streamIn.pipe(proc.stdin);
        }

        return stream;
};

var _uuid = function () {
	var _seed = process.hrtime();
	_seed = _seed[0] + 1E9 * _seed[1];
	return Math.random() + _seed
};

var uuid = function () {
	return ripe(String(_uuid()));
}

var pInc = (function(db) {
        var cache = {}, noop = new Function;

        var inc = function (key, val, callback) {
                if (typeof val === "function") {
                        callback = val
                        val = 1
                } else if (arguments.length < 2) {
                        val = 1
                }

                callback = callback || noop

                if (cache[key]) {
                        cache[key].ready.push(callback)
                        cache[key].value += val
                        return
                }

                cache[key] = {
                        value: val,
                        ready: [callback]
                }

                db.get(key, function(err, current) {
                        var ready = cache[key].ready

                        current = current | 0
                        current += cache[key].value
                        delete cache[key]

                        db.put(key, current, function(err) {
                                ready.map(function(cb) {
                                        return cb(err)
                                })
                        })
                })
        }

        return inc
})(settings);

var postIterator;

settings.get("lastPost", function (err, p) {
	postIterator = p | 0

	posts.co.get("all", { version: postIterator })(function (err, post) {
		if ( !err ) ++postIterator // increase if bot died before incrementor was raised
	})
})

var incAndUpdate = function (cb) {
	var k = postIterator++;
	settings.put("lastPost", k + "", function () {
		cb(k)
	})
}

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
	// Postings
		post: function (envelope, cb) {
			var host = envelope.envelope.user.host;
			var nick = envelope.envelope.user.nick.toLowerCase();
			var displayNick = envelope.envelope.user.nick;

			return ref.get(host, function (err, _d) {
				if (err) return cb({});

				users.get(_d, function (err, user) {
					if (err) return cb({});

					var shortname;

					try {
						shortname = envelope.link.path.split("/").pop().split(".").shift();
					} catch(e) {
						return cb({
							notice: "Unknown error"
						});
					}

					var ext = envelope.link.href.split(".").pop();

					var image = uuid();
					var thumb = uuid();

					return request(envelope.link.href, {
						encoding: null
					}, function (error, response, body) {
						if (!error && response.statusCode == 200) {
							var source = process.cwd() + "/static/images/" + image + "." + ext;

							fs.writeFile(source, body, function (err) {
								if (err) return fs.unlink(source);

								eimg.info(process.cwd() + "/static/images/" + image + "." + ext, function (err, img) {
									if (err) return fs.unlink(source);

									if ( (img.width * img.height) > 64E6 ) { // 64E6 = 8k * 8k
										return fs.unlink(source), cb({
											notice: "Resolution too big."
										});
									}

									ext = img.type.toLowerCase();

									fs.rename (source, process.cwd() + "/static/images/" + image + "." + ext, function () {
										eimg.thumbnail({
											src: process.cwd() + "/static/images/" + image + "." + ext,
											dst: process.cwd() + "/static/images/thumbs/" + thumb + "." + ext,
											width: 128, height: 128,
											x: 0, y: 0
										}, function (err, img) {
											if (err) return fs.unlink(source), fs.unlink(process.cwd() + "/static/images/thumbs/" + thumb + "." + ext);

											incAndUpdate(function (itemId) {
												posts.put(image, itemId);
												posts.put(user.nick + "\xFF" + itemId, "");

												user.name = user.nick;

												posts.put("all", {
													user: _d,
													title: shortname,
													channel: {
														name: envelope.envelope.target
													},
													created: (Date.now()/1000)|0,
													image: image + "." + ext,
													thumb: thumb + "." + ext,
													source: envelope.link.href,
													type: "image",
													keyword: image
												}, { version: itemId }, function () {
													cb({
														notice: "[RPC] OK. Posted as: " + user.nick + "; debug: " + JSON.stringify(image) + "; " + JSON.stringify(img)
													});
												})
											});
										});
									});
								});
							});
						}
					})
				});
			});

			cb({
				notice: "[RPC] " + JSON.stringify(envelope)
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

	sock.on("data", function (data) {console.log(data.toString())
		try {
			data = JSON.parse(data.toString())
		} catch(e) { return void 0 }

		if ( data.nodeName ) {
			node = data.nodeName;

			if ( !health[node] )
				health[node] = {
					nick: data.nodeName,
					channels: []
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