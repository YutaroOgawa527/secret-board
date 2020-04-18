'use strict';
const crypto = require('crypto');
const pug = require('pug');
const Cookies = require('cookies');
const moment = require('moment-timezone');
const util = require('./handler-util');
const Post = require('./post');

const trackingIdKey = 'tracking_id';

function handle(req, res) {
  const cookies = new Cookies(req, res);
  // addTrackingCookie(cookies);
  const trackingId = addTrackingCookie(cookies, req.user);
  switch (req.method) {
    case 'GET':
      res.writeHead(200, {
        'Content-Type': 'text.html; charset=utf-8',
      });
      Post.findAll({ order: [['id', 'DESC']] }).then((posts) => {
        posts.forEach((post) => {
          post.content = post.content.replace(/\+/g, ' ');
          post.formattedCreatedAt = moment(post.createdAt)
            .tz('Asia/Tokyo')
            .format('YYYY年MM月DD日 HH時mm分ss秒');
        });
        res.end(pug.renderFile('./views/posts.pug', { posts, user: req.user }));
        console.info(
          `閲覧されました\nuser: ${req.user},` +
            `トラッキングID: ${trackingId},` +
            `IPアドレス: ${req.connection.remoteAddress},` +
            `userAgent: ${req.headers['user-agent']}`
        );
      });

      break;
    case 'POST':
      // TODO POSTの処理
      let body = '';
      req
        .on('data', (chunk) => {
          body = body + chunk;
        })
        .on('end', () => {
          const decoded = decodeURIComponent(body);
          const content = decoded.split('content=')[1];
          console.info(`投稿されました: ${content}`);

          Post.create({
            content: content,
            trackingCookie: trackingId,
            postedBy: req.user,
          }).then(() => {
            handleRedirectPosts(req, res);
          });
        });
      break;
    default:
      util.handleBadRequest(req, res);
      break;
  }
}

function handleDelete(req, res) {
  switch (req.method) {
    case 'POST':
      let body = '';
      req
        .on('data', (chunk) => {
          body += chunk;
        })
        .on('end', () => {
          const decoded = decodeURIComponent(body);
          const id = decoded.split('id=')[1];
          Post.findById(id).then((post) => {
            if (req.user === post.postedBy || req.user === 'admin') {
              post.destroy().then(() => {
                console.info(
                  `削除されました: user: ${req.user}, ` +
                    `remoteAddress: ${req.connection.remoteAddress}, ` +
                    `userAgent: ${req.headers['user-agent']} `
                );
                handleRedirectPosts(req, res);
              });
            }
          });
        });
      break;
    default:
      util.handleBadRequest(req, res);
      break;
  }
}

/**
 * Cookieに含まれているトラッキングIDに異常がなければその値を返し、
 * 存在しない場合や異常なものである場合には、再度作成しCookieに付与してその値を返す
 * @param {Cookies} cookies
 * @param {String} userName
 * @return {String} トラッキングID
 */
function addTrackingCookie(cookies, userName) {
  const requestedTrackingId = cookies.get(trackingIdKey);
  if (isValidTrackingId(requestedTrackingId, userName)) {
    return requestedTrackingId;
  } else {
    const originalId = parseInt(crypto.randomBytes(8).toString('hex'), 16);
    const tomorrow = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const trackingId = originalId + '_' + createValidHash(originalId, userName);
    cookies.set(trackingIdKey, trackingId, { expires: tomorrow });
    return trackingId;
  }
}

function isValidTrackingId(trackingId, userName) {
  if (!trackingId) {
    return false;
  }
  const splitted = trackingId.split('_');
  const originalId = splitted[0];
  const requestedHash = splitted[1];
  return createValidHash(originalId, userName) === requestedHash;
}

const secretKey = `bc5bec09b7f8399407bf02d8ba5ab5fcfba5bf6300eba13
  541d3c06f4d01162b47be2feb6c7a7268ba773855e28c7b3
  8f345c41fcc68e540366d6e159cfc1e53089156e0c2861ec
  c4d4fedfe7ed185c2ee2d4beb5a89c22bfaaa1f0bc635d50
  99db0ef529433177aa0ad6abb664b29152cb593a68e5c798
  f881a1d9c00d3aa438a52d9ee950dd3b1beb4fe8c0f86cff
  64306e3fc0e870fb11231250f99271f80708df11a8c51eb4
  dd589fdb31b93be0918c876b14e465539668342fe4d88779
  943bbc456dfed02da2930ee92f750c71399b2c0a71a1842c
  ed013be836ed95304e8f687e2f6e96871baf5c0b6f5548cc
  c0e9c26cba6942618e0d3e33fe5bc80cc`;

function createValidHash(originalId, userName) {
  const sha1sum = crypto.createHash('sha1');
  sha1sum.update(originalId + userName + secretKey);
  return sha1sum.digest('hex');
}

function handleRedirectPosts(req, res) {
  res.writeHead(303, {
    Location: '/posts',
  });
  res.end();
}

module.exports = {
  handle,
  handleDelete,
};
