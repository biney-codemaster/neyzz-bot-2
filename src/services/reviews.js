const { getDb } = require('../db/database');

function createReview({ orderId, userId, rating, comment = '' }) {
  getDb()
    .prepare(
      `INSERT INTO reviews (order_id, user_id, rating, comment) VALUES (?, ?, ?, ?)`,
    )
    .run(orderId, userId, rating, comment);
  return getDb().prepare('SELECT * FROM reviews WHERE order_id = ?').get(orderId);
}

function getReviewByOrder(orderId) {
  return getDb().prepare('SELECT * FROM reviews WHERE order_id = ?').get(orderId);
}

function listReviews(limit = 20) {
  return getDb()
    .prepare(
      `SELECT r.*, o.public_id, o.username
       FROM reviews r
       JOIN orders o ON o.id = r.order_id
       ORDER BY r.id DESC
       LIMIT ?`,
    )
    .all(limit);
}

function averageRating() {
  const row = getDb()
    .prepare('SELECT AVG(rating) AS avg, COUNT(*) AS count FROM reviews')
    .get();
  return {
    average: row.count ? Number(row.avg.toFixed(2)) : 0,
    count: row.count,
  };
}

module.exports = {
  createReview,
  getReviewByOrder,
  listReviews,
  averageRating,
};
