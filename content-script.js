(Element.prototype.appendAfter = function (element) {
  element.parentNode.insertBefore(this, element.nextSibling);
}),
  false;

const getTLD = () => {
  const isUK = window.location.origin.endsWith('.co.uk');
  if (isUK) return 'co.uk';
  return window.location.origin.split('.').pop();
};

const numberWithCommas = (x) => x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const getRatingPercentage = (ratingText) => {
  let matches = ratingText.match(/\d+(?=% of reviews have 5 stars)/g);
  if (matches) {
    let oneMatches = ratingText.match(/\d+(?=% of reviews have 1 stars)/g);
    return {
      fiveStars: ratingText.match(/\d+(?=% of reviews have 5 stars)/g)[0],
      oneStars: oneMatches ? oneMatches[0] : 0,
    };
  }
  return {
    fiveStars: ratingText.match(/(?<=5 stars represent )(\d+)/g)[0],
    oneStars: ratingText.match(/(?<=1 stars represent )(\d+)/g)[0],
  };
};

const getRatingScores = async (productSIN, elementToReplace, numOfRatings) => {
  const ratingDetails = await fetch(
    `https://www.amazon.${getTLD()}/gp/customer-reviews/widgets/average-customer-review/popover/ref=dpx_acr_pop_?contextId=dpx&asin=${productSIN}`,
    {
      body: null,
      method: 'GET',
      mode: 'cors',
      credentials: 'include',
    }
  );

  const text = await ratingDetails.text();
  const { fiveStars, oneStars } = getRatingPercentage(text);

  const scorePercentage = fiveStars - oneStars;
  const scoreAbsolute = Math.round(parseInt(numOfRatings) * (scorePercentage / 100));

  const calculatedScore = Math.round(scoreAbsolute * (scorePercentage / 100), 2);

  elementToReplace.innerHTML = ` ${numberWithCommas(calculatedScore)} ratio: (${scorePercentage}%)`;
  checkedProducts.push(productSIN);

  return { calculatedScore };
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

  await getRatingScores(productSIN, numOfRatingsElement, numOfRatings);
})();
