// Checks and cleans the query string of GET /api/v1/listings (browse + search + filters).
//
// Returns { filters, searchTerms, sort, limit, cursor } or throws a 400 ApiError that lists
// every problem at once. Unknown parameters are REJECTED (so a typo such as "categroy"
// never silently shows unfiltered results). Empty values ("?category=") count as "not given".
//
// Accepted parameters:
//   q            search words (title + description), max 5 words / 100 characters
//   category, size, gender, condition, listingType (alias: type)
//                one value, or several separated by commas / repeated: "size=m,l"
//   colour (alias: color)   exact colour, any letter case
//   sort         newest (default) | oldest | price_asc | price_desc
//   limit        1-50 (default 12)
//   cursor       opaque value from the previous page's meta.nextCursor

const ApiError = require('../utils/ApiError');
const {
  LISTING_CATEGORIES,
  LISTING_SIZES,
  LISTING_GENDERS,
  LISTING_CONDITIONS,
  LISTING_TYPES,
  BROWSE_SORTS,
  BROWSE,
} = require('../config/constants');

const ALLOWED_PARAMS = [
  'q',
  'category',
  'size',
  'gender',
  'condition',
  'listingType',
  'type',
  'colour',
  'color',
  'sort',
  'limit',
  'cursor',
];

// Cloudant bookmarks are URL-safe base64-like text.
const CURSOR_PATTERN = /^[A-Za-z0-9_\-+/=]{1,2000}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

function cleanText(value) {
  return value.replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim();
}

function validateBrowseQuery(query) {
  const input = query && typeof query === 'object' ? query : {};
  const errors = [];
  const addError = (field, message) => errors.push({ field, message });

  Object.keys(input)
    .filter((key) => !ALLOWED_PARAMS.includes(key))
    .forEach((key) => addError(key.slice(0, 40), 'Unknown query parameter.'));

  // A parameter that may only be given once (a text value). Returns the text or undefined.
  const single = (field) => {
    const raw = input[field];
    if (raw === undefined) return undefined;
    if (typeof raw !== 'string') {
      addError(field, 'Send this parameter only once, as plain text.');
      return undefined;
    }
    return raw;
  };

  // A filter that takes one or several values from a fixed list.
  const choiceList = (field, label, allowed, source = field) => {
    const raw = input[source];
    if (raw === undefined) return undefined;
    const parts = Array.isArray(raw) ? raw : [raw];
    if (!parts.every((part) => typeof part === 'string')) {
      addError(source, `${label} must be plain text values.`);
      return undefined;
    }
    const values = [
      ...new Set(
        parts
          .join(',')
          .split(',')
          .map((value) => value.trim().toLowerCase())
          .filter((value) => value !== '')
      ),
    ];
    if (values.length === 0) return undefined;
    if (values.length > BROWSE.MAX_FILTER_VALUES) {
      addError(source, `${label}: at most ${BROWSE.MAX_FILTER_VALUES} values.`);
      return undefined;
    }
    const unknown = values.filter((value) => !allowed.includes(value));
    if (unknown.length > 0) {
      addError(source, `${label} must be one of: ${allowed.join(', ')}.`);
      return undefined;
    }
    return values;
  };

  const filters = {};

  const category = choiceList('category', 'Category', LISTING_CATEGORIES);
  if (category) filters.category = category;
  const size = choiceList('size', 'Size', LISTING_SIZES);
  if (size) filters.size = size;
  const gender = choiceList('gender', 'Gender', LISTING_GENDERS);
  if (gender) filters.gender = gender;
  const condition = choiceList('condition', 'Condition', LISTING_CONDITIONS);
  if (condition) filters.condition = condition;

  // listingType, with "type" as an alias
  if (input.listingType !== undefined && input.type !== undefined) {
    addError('type', 'Use either "listingType" or "type", not both.');
  } else {
    const source = input.listingType !== undefined ? 'listingType' : 'type';
    const listingType = choiceList('listingType', 'Listing type', LISTING_TYPES, source);
    if (listingType) filters.listingType = listingType;
  }

  // colour, with "color" as an alias
  if (input.colour !== undefined && input.color !== undefined) {
    addError('color', 'Use either "colour" or "color", not both.');
  } else {
    const colourField = input.colour !== undefined ? 'colour' : 'color';
    const rawColour = single(colourField);
    if (rawColour !== undefined) {
      const colour = cleanText(rawColour);
      if (colour.length > BROWSE.MAX_COLOUR_LENGTH) {
        addError(colourField, `Colour can be at most ${BROWSE.MAX_COLOUR_LENGTH} characters.`);
      } else if (colour !== '') {
        filters.colour = colour;
      }
    }
  }

  // search words
  let searchTerms = [];
  const rawSearch = single('q');
  if (rawSearch !== undefined) {
    const text = cleanText(rawSearch);
    if (text.length > BROWSE.MAX_SEARCH_LENGTH) {
      addError('q', `Search can be at most ${BROWSE.MAX_SEARCH_LENGTH} characters.`);
    } else if (text !== '') {
      searchTerms = text.split(' ');
      if (searchTerms.length > BROWSE.MAX_SEARCH_TERMS) {
        addError('q', `Search can have at most ${BROWSE.MAX_SEARCH_TERMS} words.`);
        searchTerms = [];
      }
    }
  }

  // sort
  let sort = BROWSE.DEFAULT_SORT;
  const rawSort = single('sort');
  if (rawSort !== undefined && rawSort.trim() !== '') {
    const value = rawSort.trim().toLowerCase();
    if (BROWSE_SORTS.includes(value)) {
      sort = value;
    } else {
      addError('sort', `Sort must be one of: ${BROWSE_SORTS.join(', ')}.`);
    }
  }

  // limit (a whole number from 1 to MAX_LIMIT)
  let limit = BROWSE.DEFAULT_LIMIT;
  const rawLimit = single('limit');
  if (rawLimit !== undefined && rawLimit.trim() !== '') {
    const text = rawLimit.trim();
    const number = /^\d{1,6}$/.test(text) ? Number(text) : NaN;
    if (Number.isInteger(number) && number >= 1 && number <= BROWSE.MAX_LIMIT) {
      limit = number;
    } else {
      addError('limit', `Limit must be a whole number from 1 to ${BROWSE.MAX_LIMIT}.`);
    }
  }

  // cursor (opaque; only its shape is checked here)
  let cursor;
  const rawCursor = single('cursor');
  if (rawCursor !== undefined && rawCursor.trim() !== '') {
    if (CURSOR_PATTERN.test(rawCursor.trim())) {
      cursor = rawCursor.trim();
    } else {
      addError('cursor', 'Invalid cursor. Use the nextCursor value from the previous response.');
    }
  }

  if (errors.length > 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted query parameters.', errors);
  }
  return { filters, searchTerms, sort, limit, cursor };
}

module.exports = { validateBrowseQuery };
