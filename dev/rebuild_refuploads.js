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

var dqueue = [];

db.createKeyStream({
        start: "\xFFposts",
        end: "\xFFposts\u9999"
}).on("data", function(key) {
        if (key.split("\xFF")[2] === "all")
                return;

        return dqueue.push(key);
}).on("end", co(function * () {
        for ( var item in dqueue ) {
                yield db.co.del(dqueue[item])
                console.log("Delete --> ", dqueue[item]);
        }

        var xqueue = [];

        db.createKeyStream({
                start: "\xFFref",
                end: "\xFFref\u9999"
        }).on("data", function(key) {
                return xqueue.push(key);
        }).on("end", co(function * () {
                for ( var x in xqueue ) {
                        var id = xqueue[x].split("\xFF")[2];

                        if ( /[0-9a-f]{40}/.test(id) ) {
                                yield db.co.del(xqueue[x]);
                                console.log("Delete --> ", xqueue[x]);
                        }
                }

                var userPosts = [], ref_idKeyword = [], ref_hash = [];

                var thumbs = [], images = [];

                posts.createVersionStream("all").on("data", function (key) {
                        if (key.version === 0) key.version = 0;

                        thumbs.push(key.value.thumb);
                        images.push(key.value.image);

                        userPosts.push([key.value.user, key.version]),
                        ref_idKeyword.push([key.value.keyword, key.version]),
                        ref_hash.push([key.value.hash, key.version, key.value.keyword]);
                }).on("end", co(function *() {
                        for ( var post in userPosts ) {
                                yield db.co.put("\xFFposts\xFF" + userPosts[post][0] + "\xFF" + userPosts[post][1], ""); 
                                console.log("Upload: \xFFposts\xFF" + userPosts[post][0] + "\xFF" + userPosts[post][1], "");
                        }

                        for ( var key in ref_idKeyword ) {
                                yield db.co.put("\xFFposts\xFF" + ref_idKeyword[key][0], ref_idKeyword[key][1]);
                                console.log("Item-ref: \xFFposts\xFF" + ref_idKeyword[key][0], ref_idKeyword[key][1]);
                        }

                        for ( var key in ref_hash ) {
                                yield db.co.put("\xFFref\xFF" + ref_hash[key][0], { id: ref_hash[key][1], keyword: ref_hash[key][2] });
                                console.log("Hashref: \xFFref\xFF" + ref_hash[key][0], { id: ref_hash[key][1], keyword: ref_hash[key][2] });
                        }

                        console.log("\nImage-refs:\n")

                        var imagesDisk = fs.readdirSync(process.cwd() + "/static/images").filter(function (img) {
                                return img.split(".").length === 2
                        })

                        imagesDisk.filter(function (id) {
                                return !~images.indexOf(id)
                        }).forEach(function (id) {
                                console.log("Deleting: " + process.cwd() + "/static/images/" + id);
                                fs.unlinkSync(process.cwd() + "/static/images/" + id);
                        })

                        console.log("\nThumb-refs:\n")

                        var thumbsDisk = fs.readdirSync(process.cwd() + "/static/images/thumbs").filter(function (img) {
                                return img.split(".").length === 2
                        });

                        thumbsDisk.filter(function (id) {
                                return !~thumbs.indexOf(id)
                        }).forEach(function (id) {
                                console.log("Deleting: " + process.cwd() + "/static/images/thumbs/" + id);
                                fs.unlinkSync(process.cwd() + "/static/images/thumbs/" + id);
                        })

                        process.exit();
                }))
        }));
}));