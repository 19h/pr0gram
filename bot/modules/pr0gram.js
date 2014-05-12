module.exports = function(irc) {
	var isIgnoredUser = module.exports.isIgnoredUser = function(address) {
		var _ref;
		var ignoredUsers = ((_ref = irc.config.ignore) != null ? _ref['users'] : void 0) || [];
		var f = ignoredUsers.filter(function(a) {
			return address.match(a);
		});
		return f.length;
	};

        var saveConfig = function () {
                delete irc.config["$0"];
                delete irc.config["_"];
                irc.supervisor({
                        save: JSON.stringify(irc.config, null, 4)
                });
        }

	var net = require("net"),
	    url = require("url");

	var http = require("http"),
	   https = require("https");

	var crypto = require("crypto");

	var client;

	// auto reconnect on failure
        var setupClient = function () {
                var c = net.connect({port: 8124});

                c.on("data", function(data) {
                        try {
                                data = JSON.parse(data)
                        } catch (e) { return void 0 }

                        if ( !data.refKey || !data.payload )
                                return void 0;

                        main.fire(data.refKey, data.payload);
                        
                        c.end();
                });

                c.on("end", function() {
                        setImmediate(function () {
                                client = setupClient();
                        });
                });

                c.on("disconnect", function (){
                        setImmediate(function () {
                                client = setupClient();
                        });
                });

                return c
        }

        client = setupClient();

        var main = (function () {
                var queue = {};

                return {
                        queue: function (payload, cb) {
                                var id = crypto.createHash("whirlpool").update(Math.random() + Date.now() + "").digest("hex");

                                queue[id] = cb;

                                client.write(JSON.stringify({
                                        refKey: id,
                                        payload: payload
                                }));
                        },
                        fire: function (key, payload) {
                                queue[key] && queue[key](payload);
                                delete queue[key];
                        }
                }
        })()

	var magicNumbers = [
		["47494638", "gif"],
		["ffd8ffdb", "jpeg"],
		["89504e47", "png"]
	]

	var findType = function (buffer) {
		var type; buffer = buffer.toString("hex", 0, 10);
		console.log(buffer);
		magicNumbers.forEach(function (v) {
			if ( !buffer.indexOf(v[0]) )
				return type = v[1];
		})

		return type
	}

	irc.on('privmsg', function(e) {
		// will be handled by admin.js
		if ( e.target === irc.config.info.nick ) return void 0;

		// "asdoasd asda ad aads http://pr0gr.dev/239033.gif asdasdasadsadadadasd"

		var links = e.text.match(/\bhttps?:[^)''"]+\.(?:jpg|jpeg|gif|png)(?![a-z/])/);

                if (links === null) return void 0;

                var link = url.parse(links[0]);

                if ( !/((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)/.test(link.href) )
                	return void 0;

                var isPrivate;

                // dont import pictures that are marked with "?" (dont post)
                if (e.text[e.text.indexOf(link.href) + link.href.length] === "?")
                	isPrivate = true;

                if ( link.href.substr(0, 5) === "https" ) {
                	link.rejectUnauthorized = false;
                	link.requestCert = false;
			
			var conn = https.request(link, function (sock) {
				sock.on("data", function (data) {
					console.log(findType(data));

					conn.abort()
				})
			})

			conn.end();
		} else {
			var conn = http.request(link, function (sock) {
				sock.on("data", function (data) {
					var type = findType(data);
					var length = +sock.headers["content-length"];

					if (!type) return conn.abort();

					irc.send("privmsg", e.target, "[BOT] Assuming type: " + type + " Fingerprint: " + data.toString("hex", 0, 4) + " Length: " + length + " Marked as private: " + (isPrivate ? "true" : "false"));

					main.queue({
						type: "post",
						format: type,
						envelope: e,
						link: link,
						isPrivate: isPrivate
					}, function (data) {
						data.notice && irc.send("privmsg", e.target, data.notice);
					})

					conn.abort()
				})
			})

			conn.end()
		}
	});

	irc.on("connect", function() {
		var core = irc.use(require("ircee/core"));
		core.login(irc.config.info);

		irc.config.channels.forEach(function (e) {
			irc.send("names", e);
		});
	});

	irc.on("001", function(e) {
		(irc.config.channels || []).forEach(function(c) {
			irc.send("join", c);
		});
	});

	// yup, should be global
	global.chanstats = {};

	irc.on("353", function (e) {
		var target = e.params[2];

		var nicks = {};

		e.text.split(" ").forEach(function (nick) {
			if ( nick[0] === "@" ) return nicks[nick.substr(1)] = "@";
			if ( nick[0] === "+" ) return nicks[nick.substr(1)] = "+";

			return nicks[nick] = "";
		})

		global.chanstats[target] = nicks;
	})

	irc.on("part", function (e) {
		if ( e.user.nick === irc.config.info.nick ) return void 0;

		// reload nicks
		irc.config.channels.forEach(function (e) {
			irc.send("names", e);
		});
	})

	irc.on("join", function (e) {
		if ( e.user.nick === irc.config.info.nick ) return void 0;

		// reload nicks
		irc.config.channels.forEach(function (e) {
			irc.send("names", e);
		});
	})

	irc.on("403", function (e) {
		irc.config.channels = irc.config.channels.filter(function (channel) {
			return channel && channel !== e.params[1] && channel[0] === "#"
		});

		saveConfig();
	})

	irc.on("477", function (e) {
		irc.config.channels = irc.config.channels.filter(function (channel) {
			return channel && channel !== e.params[1] && channel[0] === "#"
		});

		saveConfig();
	})
}