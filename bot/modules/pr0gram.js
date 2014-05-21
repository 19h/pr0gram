var net = require("net"),
    url = require("url"),
   path = require("path");

var http = require("http"),
   https = require("https");

var crypto = require("crypto");

var r = require("request");

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

	var client;

	global.handlers = [];

	var hs_intv, hs_rc = false;
	var i = 0;

	var isConnected = false;

	// auto reconnect on failure
        var setupClient = function () {
        	if ( isConnected ) return false;

        	console.log("<bot-pr0gram:" + ++i + "> RPC is connecting..")

                var c = net.connect({port: 8124});

                clearInterval(hs_intv);

                var _hs = function () {
                	if ( hs_rc !== false )
                		if ( (Date.now() - hs_rc) < 1000 )
                			return;

			c.write(JSON.stringify({
				refKey: void 0,
				nodeName: irc.config.info.nick,
				payload: {
					type: "handshake",
					nick: irc.config.info.nick,
					channels: irc.config.channels,
					uptime: process.uptime()
				}
			}))

			hs_rc = Date.now();
		}

		_hs();

                hs_intv = setInterval(_hs, 1500);

                c.on("connect", function () {
                	isConnected = true;
                	console.log("<bot-pr0gram:" + i + "> RPC is connected!")
                })

                c.on("data", function(data) {
                        try {
                                data = JSON.parse(data.toString())
                        } catch (e) { return void 0 }

                        if ( !data.refKey || !data.payload )
                                return void 0; // probably ACK ({ payload: { status: 'OK' } })

                        global.handlers.forEach(function (handler) {
                        	handler.fire(data.refKey, data.payload)
                        })
                });

                c.on("end", function() {
                	isConnected = false;
                	console.log("<bot-pr0gram:" + i + "> RPC was disconnected! end")
                        setTimeout(setupClient, 500);
                });

                c.on("disconnect", function (){
                	isConnected = false;
                	console.log("<bot-pr0gram:" + i + "> RPC was disconnected! disconnect")
                        setTimeout(setupClient, 500);
                });

                c.on("error", function (){
                	isConnected = false;
                	console.log("<bot-pr0gram:" + i + "> RPC was disconnected! error")
                        setTimeout(setupClient, 500);
                });

                client = c, global.client = c
        }

        setupClient();

        var main = (function () {
                var queue = {};

                return {
                        queue: function (payload, cb) {
                                var id = crypto.createHash("whirlpool").update(Math.random() + Date.now() + "").digest("hex");

                                queue[id] = cb;

                                client.write(JSON.stringify({
                                        refKey: id,
                                        payload: payload,
                                        nodeName: irc.config.info.nick
                                }));
                        },
                        fire: function (key, payload) {
                                queue[key] && queue[key](payload);
                                delete queue[key];
                        }
                }
        })()

        global.handlers.push(main);

	var magicNumbers = [
		["474946", "gif"],
		["ffd8ff", "jpeg"],
		["89504e", "png"]
	]

	var findType = function (buffer) {
		var type; buffer = buffer.toString("hex", 0, 6);
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

		if ( e.user.host.split(".").slice(1).join(".") !== "users.quakenet.org" )
			return void 0;

		// "asdoasd asda ad aads http://pr0gr.dev/239033.gif asdasdasadsadadadasd"

		var links = e.text.match(/\bhttps?:[^)''"]+\.(?:jpg|jpeg|gif|png)(?![a-z/])/);

                if (links === null) return void 0;

                var link = url.parse(links[0]);

                if (!link.href)
                	return void 0;

                link.href = decodeURIComponent(link.href);

                if ( !/((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)/.test(link.href) )
                	return void 0;

                var isPrivate;

                // dont import pictures that are marked with "?" (dont post)
                if (e.text[e.text.indexOf(link.href) + link.href.length] === "?")
                	isPrivate = true;

                var _handler = function (err, resp, body) {
                	if (err) return void 0;

			var type = findType(body);
			var length = body.length;

			irc.send("privmsg", e.target, "buf: " + body.toString("hex", 0, 10))

			if (!type) return conn.abort();

			irc.send("privmsg", e.target, "[BOT] Assuming type: " + type + " Fingerprint: " + body.toString("hex", 0, 4) + " Length: " + length + " Marked as private: " + (isPrivate ? "true" : "false"));

			main.queue({
				type: "post",
				format: type,
				envelope: e,
				link: link,
				isPrivate: isPrivate
			}, function (data) {
				data.notice && irc.send("privmsg", e.target, data.notice);
			})
		}

		r(link.href, {
			encoding: null
		}, _handler);
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

	/*irc.on("353", function (e) {
		var target = e.params[2];

		var nicks = {};

		e.text && e.text.split(" ").forEach(function (nick) {
			if ( nick[0] === "@" ) return nicks[nick.substr(1)] = "@";
			if ( nick[0] === "+" ) return nicks[nick.substr(1)] = "+";

			return nicks[nick] = "";
		})

		global.chanstats[target] = nicks;
	})*/

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

	irc.on("464", function () {
		require(path.join(process.cwd(), "../lib/loginHandler.js"))(irc)
	})

	irc.on("477", function (e) {
		irc.config.channels = irc.config.channels.filter(function (channel) {
			return channel && channel !== e.params[1] && channel[0] === "#"
		});

		saveConfig();
	})
}