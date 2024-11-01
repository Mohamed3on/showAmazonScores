const NUMBER_OF_PAGES_TO_PARSE = 7;

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
  let matches = htmlText.match(/aria-valuenow="(\d+)%?"/g);

  if (!matches || matches.length < 2) {
    return { fiveStars: 0, oneStars: 0 };
  }

  let fiveStars = matches[0].match(/(\d+)/)[1];
  let oneStars = matches[matches.length - 1].match(/(\d+)/)[1];

  return {
    fiveStars: fiveStars,
    oneStars: oneStars,
  };
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

  const fetchReviewPage = async (pageNumber) => {
    const recentRatings = await fetch(`${recentRatingsURL}&pageNumber=${pageNumber}`, {
      body: null,
      method: 'GET',
      mode: 'cors',
      credentials: 'include',
    });
    return await recentRatings.text();
  };

  const fetchPromises = Array.from({ length: NUMBER_OF_PAGES_TO_PARSE }, (_, i) =>
    fetchReviewPage(i + 1)
  );
  const results = await Promise.allSettled(fetchPromises);
  const reviewPages = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  for (const recentRatingsHTML of reviewPages) {
    if (!totalRatingPercentages) {
      totalRatingPercentages = getRatingPercentages(recentRatingsHTML);
      let { calculatedScore, totalScorePercentage } = setTotalRatingsScore(
        totalRatingPercentages,
        numOfRatingsElement,
        numOfRatings
      );
      scores.total = { calculated: calculatedScore, percentage: totalScorePercentage };
    }

    const document = parser.parseFromString(recentRatingsHTML, 'text/html');

    const reviews = document.querySelectorAll('[data-hook="review"]');
    const ratingElements = document.querySelectorAll('[data-hook="review-star-rating"]');

    for (const review of reviews) {
      const ratingElement = review.querySelector('[data-hook="review-star-rating"]');

      // this means it's an "international" review, not from the current country
      if (!ratingElement) break;

      numberOfParsedReviews++;
      const format = review.querySelector('a[data-hook="format-strip"]');

      const ratingText = ratingElement.innerText;
      const rating = parseInt(ratingText.match(/\d(?=\.)/g)[0]);

      if (rating === 5 || rating === 1) {
        if (format) {
          let cleanedFormat = format.innerHTML.replaceAll(' Name:', ':');
          formatRatings[cleanedFormat] = formatRatings[cleanedFormat]
            ? formatRatings[cleanedFormat] + starRatingsToLikeDislikeMapping[rating]
            : starRatingsToLikeDislikeMapping[rating];
        }

        scores.recent.absolute += starRatingsToLikeDislikeMapping[rating];
      }
    }
    // it means we reached the end of the local reviews, so we can stop the parsing
    if (ratingElements.length < numberOfReviewsPerPage) {
      break;
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
