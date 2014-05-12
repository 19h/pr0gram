var whirlpool = function (p) {
	return crypto.createHash("whirlpool").update(p).digest("hex");
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
})

pInc("lastPost");

var health = {
/*	node: {
		uptime: XXX,
		channels: XXX,
		nick: XXX
	}
*/
};

var lastWrite = (Date.now() / 1000) |0;

exports.health = health;
exports.lastWrite = lastWrite;

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
		 							since: Date.now(),
		 							posts: [],
		 							likes: [],
		 							comments: []
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

					cb({
						notice: "[RPC] " + JSON.stringify(user)
					});
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

	sock.on("data", function (data) {
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

		if ( !data.payload.type || !modules[data.payload.type] )
			return sock.write(JSON.stringify({
				refKey: data.refKey,
				payload: {}
			}))

		return modules[data.payload.type](data.payload, function (payload) {
			return sock.write(JSON.stringify({
				refKey: data.refKey,
				payload: payload
			})), sock.end();
		})
	});

	var _reset = function () {
		//delete health[node];
	}

	sock.on("close", _reset);
});

server.listen(8124);