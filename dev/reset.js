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

var dump = [];

posts.createVersionStream("all", {
        reverse: true
}).on("data", function (item) {
        dump.push(item)
}).on("end", function () {
        dump.sort(function (a, b) {
                return a.value.created - b.value.created
        }).map(function (i, k) {
                i.version = k;
        })

        if ( process.env.list )
                return console.log(dump), process.exit();

        ref.createReadStream().on("data", co(function *(data) {
                if ( /[0-9a-f]{40}/.test(data.key) ) {
                        yield ref.co.del(data.key);

                        return console.log("Deleted file-hash: " + data.key);
                } else {
                        if ( ~data.key.indexOf("\xFFtags\xFF") ) {
                                yield ref.co.del(data.key);

                                return console.log("Deleted tag: " + data.key);
                        }

                        if ( ~data.key.indexOf("\xFFcomments\xFF") ) {
                                yield ref.co.del(data.key);

                                return console.log("Deleted comment: " + data.key);
                        }
                }
        })).on("end", function () {
                var _next = function () {
                        var i = 0, n = dump.length;

                        dump.forEach(co(function *(post) {
                                yield posts.co_putver("all", post.value, post.version)

                                ++i === n && (console.log("OK"), process.exit());
                        }))
                }

                var i = 0, n = dump.length;

                dump.forEach(co(function *(post) {
                        yield posts.co_delver("all", post.oldKey);

                        ++i === n && _next();
                }))
        })
})