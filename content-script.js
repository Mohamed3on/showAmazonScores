const NUMBER_OF_PAGES_TO_PARSE = 10;

function getColor(value) {
  //value from 0 to 1
  var hue = (value * 120).toString(10);
  return ['hsl(', hue, ',100%,50%)'].join('');
}

var percentColors = [
  { pct: 0.0, color: { r: 0xff, g: 0x00, b: 0 } },
  { pct: 0.5, color: { r: 0xff, g: 0xff, b: 0 } },
  { pct: 1.0, color: { r: 0x00, g: 0xff, b: 0 } },
];

var getColorForPercentage = function (pct) {
  for (var i = 1; i < percentColors.length - 1; i++) {
    if (pct < percentColors[i].pct) {
      break;
    }
  }
  var lower = percentColors[i - 1];
  var upper = percentColors[i];
  var range = upper.pct - lower.pct;
  var rangePct = (pct - lower.pct) / range;
  var pctLower = 1 - rangePct;
  var pctUpper = rangePct;
  var color = {
    r: Math.floor(lower.color.r * pctLower + upper.color.r * pctUpper),
    g: Math.floor(lower.color.g * pctLower + upper.color.g * pctUpper),
    b: Math.floor(lower.color.b * pctLower + upper.color.b * pctUpper),
  };

  let textColor = color.r * 0.299 + color.g * 0.587 + color.b * 0.114 > 186 ? 'black' : 'white';
  return { textColor, backgroundColor: 'rgb(' + [color.r, color.g, color.b].join(',') + ')' };
  // or output as hex if preferred
};

const numberWithCommas = (x) => x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const getRatingPercentages = (htmlText) => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText || '', 'text/html');
    const nodes = doc.querySelectorAll('[role="progressbar"][aria-valuenow]');
    const values = Array.from(nodes)
      .map((el) => el.getAttribute('aria-valuenow'))
      .filter(Boolean)
      .map((v) => parseInt(String(v).replace('%', ''), 10))
      .filter((n) => Number.isFinite(n));

    if (values.length < 2) {
      return { fiveStars: 0, oneStars: 0 };
    }

    const fiveStars = values[0];
    const oneStars = values[values.length - 1];

    return { fiveStars, oneStars };
  } catch (_) {
    return { fiveStars: 0, oneStars: 0 };
  }
};

const injectBestFormats = (formatRatings) => {
  if (!Object.keys(formatRatings).length) return;

  let sortedFormats = [];
  for (var format in formatRatings) {
    if (formatRatings[format] > 0) {
      sortedFormats.push([format, formatRatings[format]]);
    }

    sortedFormats.sort(function (a, b) {
      return b[1] - a[1];
    });
  }

  const table = document.createElement('table');
  table.className = 'format-table';
  let header = table.createTHead();
  var row = header.insertRow(0);
  var cell = row.insertCell(0);
  cell.innerHTML = 'Trending variations';

  let secondCell = row.insertCell(1);
  secondCell.innerHTML = 'Score';
  const body = table.createTBody();
  sortedFormats.forEach((property) => {
    const row = body.insertRow();
    row.insertCell().innerHTML = property[0];
    row.insertCell().innerHTML = property[1];
  });

  const buyBox = document.querySelector('#desktop_buybox');
  buyBox.parentNode.insertBefore(table, buyBox);
};

const setTotalRatingsScore = (totalRatingPercentages, elementToReplace, numOfRatings) => {
  const { fiveStars, oneStars } = totalRatingPercentages;

  const scorePercentage = fiveStars - oneStars;
  const scoreAbsolute = Math.round(parseInt(numOfRatings) * (scorePercentage / 100));

  const calculatedScore = Math.round(scoreAbsolute * (scorePercentage / 100), 2);

  elementToReplace.innerHTML = ` ${numberWithCommas(calculatedScore)} ratio: (${scorePercentage}%)`;

  return { calculatedScore, totalScorePercentage: scorePercentage / 100 };
};

const getRatingSummary = async (productSIN, numOfRatingsElement, numOfRatings) => {
  let numberOfParsedReviews = 0;
  const scores = {
    recent: { absolute: 0, percentage: 0 },
    total: { calculated: 0, percentage: 0 },
  };
  const starRatingsToLikeDislikeMapping = { 5: 1, 1: -1 };
  const numberOfReviewsPerPage = 10;
  let totalRatingPercentages;
  const formatRatings = {};

  const recentRatingsURL = `/product-reviews/${productSIN}/?sortBy=recent`;
  const parser = new DOMParser();

  const extractReviewListHTMLFromAjaxResponse = (raw) => {
    if (!raw) return '';
    const chunks = raw.split('&&&');
    let html = '';
    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;
      try {
        const payload = JSON.parse(trimmed);
        if (
          Array.isArray(payload) &&
          payload.length >= 3 &&
          payload[0] === 'append' &&
          payload[1] === '#cm_cr-review_list' &&
          typeof payload[2] === 'string'
        ) {
          html += payload[2];
        }
      } catch (_) {
        // ignore non-JSON chunks
      }
    }
    return html;
  };

  const getAntiCsrfToken = () => {
    const stateElement = document.querySelector('#cr-state-object');
    if (stateElement && stateElement.dataset.state) {
      try {
        const stateData = JSON.parse(stateElement.dataset.state);
        return stateData.reviewsCsrfToken;
      } catch (_) {}
    }
    return undefined;
  };

  const getReviewsAjaxScopeFromDOM = () => {
    try {
      const html = document.documentElement.innerHTML;
      const matches = [...html.matchAll(/reviewsAjax(\d+)/g)];
      if (matches.length) {
        const maxIdx = matches
          .map((m) => parseInt(m[1], 10))
          .filter((n) => Number.isFinite(n))
          .reduce((a, b) => Math.max(a, b), 0);
        return `reviewsAjax${maxIdx}`;
      }
    } catch (_) {}
    return 'reviewsAjax0';
  };

  const fetchReviewPage = async (pageNumber) => {
    const endpoint = `/hz/reviews-render/ajax/reviews/get/ref=cm_cr_getr_d_paging_btm_next_${pageNumber}`;
    const form = new URLSearchParams({
      sortBy: 'recent',
      pageNumber: String(pageNumber),
      pageSize: String(numberOfReviewsPerPage),
      asin: productSIN,
      scope: getReviewsAjaxScopeFromDOM(),
      reftag: `cm_cr_getr_d_paging_btm_next_${pageNumber}`
    });

    const antiCsrf = getAntiCsrfToken();

    const res = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'x-requested-with': 'XMLHttpRequest',
        ...(antiCsrf ? { 'anti-csrftoken-a2z': antiCsrf } : {}),
      },
      body: form,
    });
    const raw = await res.text();
    return extractReviewListHTMLFromAjaxResponse(raw);
  };

  // try to compute total ratings from the current product page first
  try {
    const pageHTML = document.documentElement.innerHTML;
    const totals = getRatingPercentages(pageHTML);
    if (totals.fiveStars || totals.oneStars) {
      totalRatingPercentages = totals;
      const { calculatedScore, totalScorePercentage } = setTotalRatingsScore(
        totalRatingPercentages,
        numOfRatingsElement,
        numOfRatings
      );
      scores.total = { calculated: calculatedScore, percentage: totalScorePercentage };
    }
  } catch (_) {}

  const pagePromises = Array.from({ length: NUMBER_OF_PAGES_TO_PARSE }, (_, i) => 
    fetchReviewPage(i + 1)
  );
  
  const results = await Promise.allSettled(pagePromises);
  const reviewPages = results
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value);

  for (const recentRatingsHTML of reviewPages) {
    if (!recentRatingsHTML) continue;

    if (!totalRatingPercentages) {
      totalRatingPercentages = getRatingPercentages(recentRatingsHTML);
      const { calculatedScore, totalScorePercentage } = setTotalRatingsScore(
        totalRatingPercentages,
        numOfRatingsElement,
        numOfRatings
      );
      scores.total = { calculated: calculatedScore, percentage: totalScorePercentage };
    }

    const syntheticDocument = parser.parseFromString(recentRatingsHTML, 'text/html');
    const reviews = syntheticDocument.querySelectorAll('[data-hook="review"]');

    for (const review of reviews) {
      const ratingElement = review.querySelector('[data-hook="review-star-rating"]');
      if (!ratingElement) break;

      numberOfParsedReviews++;
      const format = review.querySelector('a[data-hook="format-strip"]');

      const ratingText = ratingElement.innerText;
      const rating = parseInt(ratingText.match(/\d(?=\.)/g)[0]);

      if (rating === 5 || rating === 1) {
        if (format) {
          const cleanedFormat = format.innerHTML.replaceAll(' Name:', ':');
          formatRatings[cleanedFormat] = formatRatings[cleanedFormat]
            ? formatRatings[cleanedFormat] + starRatingsToLikeDislikeMapping[rating]
            : starRatingsToLikeDislikeMapping[rating];
        }
        scores.recent.absolute += starRatingsToLikeDislikeMapping[rating];
      }
    }
  }

  let text;

  if (numberOfParsedReviews > 0) {
    scores.recent.percentage = (scores.recent.absolute / numberOfParsedReviews).toFixed(2);

    const trendingPercentage = scores.recent.percentage;

    const trendingScore = Math.round(scores.total.calculated * trendingPercentage);

    text = `recent reviews: ${scores.recent.percentage * 100}% trending score: ${numberWithCommas(
      trendingScore
    )}`;
  } else text = `No local reviews for this product!`;

  const elementToAppendTo = document.querySelector('#averageCustomerReviews');

  let { backgroundColor, textColor } = getColorForPercentage(scores.recent.percentage);

  const recentReviews = document.createElement('a');
  recentReviews.className = 'recent-reviews';
  recentReviews.href = recentRatingsURL;
  recentReviews.style = `
  color: ${textColor};
  background-color: ${backgroundColor};
`;
  recentReviews.innerText = `${text}`;
  elementToAppendTo.appendChild(recentReviews);

  injectBestFormats(formatRatings);
};

const getProductSIN = () => {
  let productSINMatches = window.location.toString().match(/(?<=\/(dp|product)\/)([A-Z0-9]+)/g);
  return productSINMatches && productSINMatches[0];
};

(async function main() {
  const productSIN = getProductSIN();
  if (!productSIN) return;
  const numOfRatingsElement = document.getElementById('acrCustomerReviewLink');
  const ratingText = numOfRatingsElement.textContent
    .match(/(\d{1,3}(,\d{3})*(\.\d+)?|\d+(\.\d+)?)[K]?/)[0]
    .replace(',', '');

  const numOfRatings = ratingText.endsWith('K')
    ? Math.round(parseFloat(ratingText.replace('K', '')) * 1000)
    : ratingText;

  await getRatingSummary(productSIN, numOfRatingsElement, numOfRatings);
})();
