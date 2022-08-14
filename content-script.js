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

const getTLD = () => {
  const isUK = window.location.origin.endsWith('.co.uk');
  if (isUK) return 'co.uk';
  return window.location.origin.split('.').pop();
};

const numberWithCommas = (x) => x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const getRatingPercentages = (ratingText) => {
  let matches = ratingText.match(/\d+(?=% of reviews have 5 stars)/g);
  if (matches) {
    let oneMatches = ratingText.match(/\d+(?=% of reviews have 1 stars)/g);
    return {
      fiveStars: ratingText.match(/\d+(?=% of reviews have 5 stars)/g)[0],
      oneStars: oneMatches ? oneMatches[0] : 0,
    };
  }
  return {
    fiveStars: ratingText.match(/(?<=5 stars represent )(\d+)/g)[0] || 0,
    oneStars: ratingText.match(/(?<=1 stars represent )(\d+)/g)?.[0] || 0,
  };
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
  const numberOfPages = 5;
  const scores = { recent: { absolute: 0, percentage: 0 }, total: { absolute: 0, percentage: 0 } };
  const starRatingsToLikeDislikeMapping = { 5: 1, 1: -1 };
  const numberOfReviewsPerPage = 10;
  let totalRatingPercentages;

  const recentRatingsURL = `https://www.amazon.${getTLD()}/product-reviews/${productSIN}/?sortBy=recent`;
  const parser = new DOMParser();

  for (let i = 1; i <= numberOfPages; i++) {
    const recentRatings = await fetch(`${recentRatingsURL}&pageNumber=${i}`, {
      body: null,
      method: 'GET',
      mode: 'cors',
      credentials: 'include',
    });
    const recentRatingsHTML = await recentRatings.text();
    if (!totalRatingPercentages) {
      totalRatingPercentages = getRatingPercentages(recentRatingsHTML);
      let { calculatedScore, totalScorePercentage } = setTotalRatingsScore(
        totalRatingPercentages,
        numOfRatingsElement,
        numOfRatings
      );
      scores.total = { absolute: calculatedScore, percentage: totalScorePercentage };
    }

    const document = parser.parseFromString(recentRatingsHTML, 'text/html');

    // TODO: add best variant to this
    // const reviews = document.querySelectorAll('[data-hook="review"]');
    // const format = review.querySelector('a[data-hook="format-strip"]');
    const ratingElements = document.querySelectorAll('[data-hook="review-star-rating"]');

    for (const ratingElement of ratingElements) {
      numberOfParsedReviews++;

      const ratingText = ratingElement.innerText;
      const rating = parseInt(ratingText.match(/\d(?=\.)/g)[0]);

      if (rating === 5 || rating === 1) {
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

    const percentageDifference = scores.total.percentage - scores.recent.percentage;
    const trendingWeighting = 1 - percentageDifference;

    const totalCombineDifference = Math.round(scores.total.absolute * trendingWeighting);

    text = `recent reviews: ${scores.recent.percentage * 100}% trending score: ${numberWithCommas(
      totalCombineDifference
    )}`;
  } else text = `No local reviews for this product!`;

  const elementToAppendTo = document.querySelector('#averageCustomerReviews');

  let { backgroundColor, textColor } = getColorForPercentage(scores.recent.percentage);

  const newDiv = document.createElement('a');
  newDiv.href = recentRatingsURL;
  newDiv.style = `
  padding: 4px;
  margin: 8px 0;
  display: flex;
  border-radius: 4px;
  color: ${textColor};
  background-color: ${backgroundColor};
  box-shadow: 0 4px 6px 0 hsl(0deg 0% 0% / 20%);
`;
  newDiv.innerText = `${text}`;
  elementToAppendTo.appendChild(newDiv);
  return scores;
};

const getProductSIN = () => {
  let productSINMatches = window.location.toString().match(/(?<=\/(dp|product)\/)([A-Z0-9]+)/g);
  return productSINMatches && productSINMatches[0];
};
const productPageScript = async () => {};
(async function main() {
  const productSIN = getProductSIN();
  if (!productSIN) return;
  const numOfRatingsElement = document.getElementById('acrCustomerReviewLink');
  const numOfRatings = numOfRatingsElement.textContent
    .match(/\d{1,4}(,\d{0,3})?/g)[0]
    .replace(',', '');
  console.time('getRatingSummary');
  await getRatingSummary(productSIN, numOfRatingsElement, numOfRatings);
  console.timeEnd('getRatingSummary');
})();
