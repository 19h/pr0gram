childProcess = require("child_process"),
crypto = require("crypto"),
fs = require("fs"),
http = require("http"),
https = require("https"),
mime = require("mime"),
net = require("net"),
path = require("path"),
qs = require("querystring"),
Stream = require("stream"),
url = require("url"),
util = require("util"),
repl = require("repl"),
zlib = require("zlib");

process.chdir("..")

request = require("request");

eimg = require("easyimage");

hyper = require("hyperlevel");

db = hyper("pr0gram.db", { encoding: "json" }),
   svb = require("level-sublevel");

co = require("co"), colevel = require("co-level");

lver = require("level-version");

sdb = svb(db);

users   = sdb.sublevel("users");
ref     = sdb.sublevel("ref");
vref = lver(ref);
posts   = lver(sdb.sublevel("posts"));
settings   = sdb.sublevel("config");

session = require("level-session-hyper")("session.db");

[ db, users, ref, posts, settings ].forEach(function (db) {
        db.exists = function (k, c){
                var exists;

                return db.createKeyStream({
                        start: k,
                        end: k
                }).on("data", function () {
                        exists = true
                }).on("end", function () {
                        c(exists)
                })
        };

        db.co = colevel(db);
});

[ vref, posts ].forEach(function (db) {
        db.co_getver = function (key, ver) {
                return function (cb) {
                    posts.get(key, {
                            version: ver
                    }, cb);
                }
        }

        db.co_putver = function (key, val, ver) {
                return function (cb) {
                    posts.put(key, val, {
                            version: ver
                    }, cb);
                }
        }

        db.co_delver = function (key, val, ver) {
                return function (cb) {
                        posts.del(key, {
                                version: ver
                        }, cb)
                }
        }
});

var retval = {
	firstIndex: false,
	maxId: false,
	items: [],
	total: false,
	totalKnown: true
};

return posts.createVersionStream("all", {
	limit: 1566
}).on("data", function (post) {
	retval.total = retval.total + 1;

	if ( retval.firstIndex === false )
		retval.firstIndex = post.version;

	retval.maxId = post.version;

	post.value.index = post.version;
	post.value.id    = post.version;

	post.value.channel.keyword = "yolo";
	post.value.liked = false;
	post.value.user.name = post.value.user.nick;
	post.value.tags = [];

	console.log(post)

	retval.items.push(post.value);
}).on("end", co(function *() {
	for ( var item in retval.items ) {
		if ( typeof retval.items[item].user !== "string" )
			break;

		retval.items[item].user = {
			name: retval.items[item].user
		};

		var liked = false;

		retval.items[item].liked = liked;
	}

	console.log(retval)
}));