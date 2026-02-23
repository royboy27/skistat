const { validationResult } = require('express-validator');
const { errorResponse } = require('../utils/helpers');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map(e => `${e.path}: ${e.msg}`);
    return errorResponse(res, 400, 'Validation failed', messages);
  }
  next();
};

module.exports = { validate };
