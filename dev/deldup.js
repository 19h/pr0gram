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

hyper = require("level");

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

session = require("level-session")("session.db");

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

        db.co_delver = function (key, ver) {
                return function (cb) {
                        posts.del(key, {
                                version: ver
                        }, cb)
                }
        }
});

var keylist = [];

posts.createVersionStream("all", {
	reverse: true
}).on("data", co(function *(item) {
	if ( ~keylist.indexOf(item.value.keyword) ) {
		return yield posts.co_delver("all", item.version)
	}

	keylist.push(item.value.keyword);
}))