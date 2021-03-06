var RDB = require('./redis.js'),
	async = require('async'),
	winston = require('winston'),
	user = require('./user');


function upgradeCategory(cid, callback) {
	RDB.type('categories:'+ cid +':tid', function(err, type) {
		if (type === 'set') {
			RDB.smembers('categories:' + cid + ':tid', function(err, tids) {

				function moveTopic(tid, callback) {
					RDB.hget('topic:' + tid, 'timestamp', function(err, timestamp) {
						if(err)
							return callback(err);

						RDB.zadd('temp_categories:'+ cid + ':tid', timestamp, tid);
						callback(null);
					});
				}

				async.each(tids, moveTopic, function(err) {
					if(!err) {
						RDB.rename('temp_categories:' + cid + ':tid', 'categories:' + cid + ':tid');
						callback(null);
					}
					else
						callback(err);
				});

			});
		} else {
			winston.info('category already upgraded '+ cid);
			callback(null);
		}
	});
}

function upgradeUser(uid, callback) {
	user.getUserFields(uid, ['joindate', 'postcount', 'reputation'], function(err, userData) {
		if(err)
			return callback(err);

		RDB.zadd('users:joindate', userData.joindate, uid);
		RDB.zadd('users:postcount', userData.postcount, uid);
		RDB.zadd('users:reputation', userData.reputation, uid);

		callback(null);
	});
}

exports.upgrade = function() {

	winston.info('upgrading nodebb now');

	var schema = [
		function upgradeCategories(next) {
			winston.info('upgrading categories');

			RDB.lrange('categories:cid', 0, -1, function(err, cids) {

				async.each(cids, upgradeCategory, function(err) {
					if(!err) {
						winston.info('upgraded categories');
						next(null, null);
					} else {
						next(err, null);
					}
				});
			});
		},

		function upgradeUsers(next) {
			winston.info('upgrading users');

			RDB.lrange('userlist', 0, -1, function(err, uids) {

				async.each(uids, upgradeUser, function(err) {
					if(!err) {
						winston.info('upgraded users')
						next(null, null);
					} else {
						next(err, null);
					}
				});

			});
		}
	];

	async.series(schema, function(err, results) {
		if(!err)
			winston.info('upgrade complete');
		else
			winston.err(err);

		process.exit();

	});
}