// The 30 demo listings used by "npm run seed:demo" (see scripts/seed-demo.js).
//
// Exactly 30 listings, 15 men + 15 women, 5 per category:
//
//   Screen label          backend category   Men  Women
//   Tops & Shirts         tops                3     2
//   Dresses & Kurtis      dresses             0     5
//   Jeans & Trousers      bottoms             3     2
//   Jackets & Hoodies     outerwear           3     2
//   Ethnic Wear           ethnic_wear         1     4
//   Shoes & Accessories   accessories         5     0
//
// Every value uses the backend's own codes (src/config/constants.js), so each listing passes the same
// validator as POST /api/v1/listings. All are "sell" listings with a whole-rupee price.
//
// Photos: put a file named demo-01.jpg ... demo-30.jpg (or .jpeg / .png / .webp) in backend/demo-images/.
// The number is the "n" below. Missing photos are simply skipped (see the seed script).

const DEMO_LISTINGS = [
  // ---- Tops & Shirts (tops): 3 men, 2 women ----
  { n: 1, gender: 'men', category: 'tops', title: 'White Oxford Cotton Shirt', size: 'm', colour: 'White', condition: 'like_new', price: 450, description: 'Classic button-down Oxford shirt in breathable cotton. Worn a handful of times for college presentations. No stains or frayed collar.' },
  { n: 2, gender: 'men', category: 'tops', title: 'Red Checked Flannel Shirt', size: 'l', colour: 'Red', condition: 'good', price: 380, description: 'Soft brushed flannel in red and black checks. Great layered over a tee in winter. Slight fading from washing, otherwise in good shape.' },
  { n: 3, gender: 'men', category: 'tops', title: 'Black Graphic Print T-Shirt', size: 'm', colour: 'Black', condition: 'good', price: 220, description: 'Regular-fit cotton tee with a retro graphic on the front. Print is intact with minor cracking. Comfortable everyday wear.' },
  { n: 4, gender: 'women', category: 'tops', title: 'Peach Floral Cotton Top', size: 's', colour: 'Peach', condition: 'like_new', price: 320, description: 'Light cotton top with a small floral print and puff sleeves. Perfect for summer days on campus. Worn twice.' },
  { n: 5, gender: 'women', category: 'tops', title: 'Olive Ribbed Crop Top', size: 'xs', colour: 'Olive', condition: 'new_with_tags', price: 280, description: 'Stretchy ribbed crop top, still with the original tags. Bought the wrong size and never wore it.' },

  // ---- Dresses & Kurtis (dresses): 5 women ----
  { n: 6, gender: 'women', category: 'dresses', title: 'Navy Floral Midi Dress', size: 'm', colour: 'Navy', condition: 'like_new', price: 650, description: 'Flowy midi dress in navy with a white floral print. Has a tie waist and side pockets. Worn once to a family function.' },
  { n: 7, gender: 'women', category: 'dresses', title: 'Mustard Straight Cotton Kurti', size: 'm', colour: 'Mustard', condition: 'good', price: 350, description: 'Comfortable straight-cut cotton kurti with three-quarter sleeves. Ideal for daily college wear. Colour still bright.' },
  { n: 8, gender: 'women', category: 'dresses', title: 'Indigo A-Line Printed Kurti', size: 'l', colour: 'Indigo', condition: 'like_new', price: 420, description: 'Hand-block printed A-line kurti in indigo. Pairs well with white leggings or jeans. Worn twice, washed gently.' },
  { n: 9, gender: 'women', category: 'dresses', title: 'Maroon Wrap Maxi Dress', size: 's', colour: 'Maroon', condition: 'good', price: 700, description: 'Elegant wrap-style maxi dress in a soft crepe fabric. Good for parties and dinners. One tiny pull near the hem, barely visible.' },
  { n: 10, gender: 'women', category: 'dresses', title: 'White Chikankari Kurti', size: 'm', colour: 'White', condition: 'new_with_tags', price: 850, description: 'Lucknowi chikankari kurti in pure cotton with fine hand embroidery. Brand new with tags, received as a gift.' },

  // ---- Jeans & Trousers (bottoms): 3 men, 2 women ----
  { n: 11, gender: 'men', category: 'bottoms', title: 'Slim-Fit Blue Denim Jeans', size: 'm', colour: 'Blue', condition: 'good', price: 600, description: 'Slim-fit stretch denim, waist 32 and length 32. Mid-blue wash with no rips. Some natural fading at the knees.' },
  { n: 12, gender: 'men', category: 'bottoms', title: 'Beige Cotton Chinos', size: 'l', colour: 'Beige', condition: 'like_new', price: 550, description: 'Smart beige chinos, waist 34. Ironed and ready for interviews or office wear. Worn only a few times.' },
  { n: 13, gender: 'men', category: 'bottoms', title: 'Olive Cargo Joggers', size: 'm', colour: 'Olive', condition: 'good', price: 400, description: 'Relaxed cargo joggers with six pockets and elastic cuffs. Very comfortable for travel and casual days.' },
  { n: 14, gender: 'women', category: 'bottoms', title: 'Light Blue High-Waist Mom Jeans', size: 's', colour: 'Light blue', condition: 'like_new', price: 650, description: 'High-waist mom jeans in a light wash, waist 26. Rigid cotton denim that holds its shape. Worn three times.' },
  { n: 15, gender: 'women', category: 'bottoms', title: 'Black Wide-Leg Palazzo Trousers', size: 'm', colour: 'Black', condition: 'good', price: 380, description: 'Flowy wide-leg palazzo trousers with an elastic waist. Works with both kurtis and tops. No marks or tears.' },

  // ---- Jackets & Hoodies (outerwear): 3 men, 2 women ----
  { n: 16, gender: 'men', category: 'outerwear', title: 'Classic Blue Denim Jacket', size: 'l', colour: 'Blue', condition: 'good', price: 900, description: 'Sturdy denim trucker jacket with button front and chest pockets. Broken in nicely, all buttons intact.' },
  { n: 17, gender: 'men', category: 'outerwear', title: 'Grey Zip-Up Hoodie', size: 'xl', colour: 'Grey', condition: 'good', price: 550, description: 'Warm fleece-lined zip hoodie with kangaroo pockets. Zip works smoothly. Light pilling on the sleeves.' },
  { n: 18, gender: 'men', category: 'outerwear', title: 'Black Puffer Jacket', size: 'l', colour: 'Black', condition: 'like_new', price: 1500, description: 'Lightweight padded puffer jacket, water resistant, with a detachable hood. Used for one winter trip to Manali.' },
  { n: 19, gender: 'women', category: 'outerwear', title: 'Lavender Oversized Hoodie', size: 'm', colour: 'Lavender', condition: 'like_new', price: 600, description: 'Cosy oversized pullover hoodie in a soft lavender shade. Brushed inside, perfect for chilly mornings.' },
  { n: 20, gender: 'women', category: 'outerwear', title: 'Cropped Light Denim Jacket', size: 's', colour: 'Light blue', condition: 'good', price: 750, description: 'Cropped denim jacket in a light wash. Goes over dresses and kurtis alike. Slight wear on the cuffs.' },

  // ---- Ethnic Wear (ethnic_wear): 1 man, 4 women ----
  { n: 21, gender: 'men', category: 'ethnic_wear', title: 'Cream Cotton Kurta Pyjama Set', size: 'l', colour: 'Cream', condition: 'like_new', price: 900, description: 'Two-piece cotton kurta with matching pyjama. Worn once for a Diwali puja. Clean and freshly washed.' },
  { n: 22, gender: 'women', category: 'ethnic_wear', title: 'Red Silk Saree with Blouse', size: 'free_size', colour: 'Red', condition: 'like_new', price: 1800, description: 'Soft art-silk saree in red with a golden zari border, with an unstitched blouse piece. Worn once at a wedding.' },
  { n: 23, gender: 'women', category: 'ethnic_wear', title: 'Teal Anarkali Suit Set', size: 'm', colour: 'Teal', condition: 'good', price: 1200, description: 'Floor-length Anarkali with churidar and a matching dupatta. Light embroidery on the yoke. Worn for two functions.' },
  { n: 24, gender: 'women', category: 'ethnic_wear', title: 'Pink Embroidered Lehenga Choli', size: 's', colour: 'Pink', condition: 'like_new', price: 2500, description: 'Lehenga with a padded choli and net dupatta, thread and sequin work throughout. Dry cleaned after a single wear.' },
  { n: 25, gender: 'women', category: 'ethnic_wear', title: 'Yellow Cotton Salwar Suit', size: 'l', colour: 'Yellow', condition: 'good', price: 700, description: 'Three-piece cotton salwar suit with printed dupatta. Comfortable for festivals and haldi functions.' },

  // ---- Shoes & Accessories (accessories): 5 men ----
  { n: 26, gender: 'men', category: 'accessories', title: 'White Canvas Sneakers (UK 9)', size: 'free_size', colour: 'White', condition: 'good', price: 800, description: 'Low-top canvas sneakers, UK size 9. Cleaned and with fresh laces. Soles still have plenty of grip.' },
  { n: 27, gender: 'men', category: 'accessories', title: 'Brown Leather Belt', size: 'free_size', colour: 'Brown', condition: 'like_new', price: 250, description: 'Genuine leather belt with a brushed metal buckle, fits waist 30 to 36. Barely used.' },
  { n: 28, gender: 'men', category: 'accessories', title: 'Black Analog Wristwatch', size: 'free_size', colour: 'Black', condition: 'good', price: 950, description: 'Minimal analog watch with a black dial and silicone strap. Battery replaced last month. Small scratch on the glass edge.' },
  { n: 29, gender: 'men', category: 'accessories', title: 'Tan Leather Bifold Wallet', size: 'free_size', colour: 'Tan', condition: 'like_new', price: 300, description: 'Slim bifold wallet in tan leather with six card slots and a coin pocket. Used for a few weeks.' },
  { n: 30, gender: 'men', category: 'accessories', title: 'Black Formal Leather Shoes (UK 8)', size: 'free_size', colour: 'Black', condition: 'good', price: 1100, description: 'Polished Oxford-style formal shoes, UK size 8. Worn for interviews and a few events. Fresh polish, soles in good condition.' },
];

// The required split, checked by the seed script and the tests before anything is written.
const EXPECTED_DISTRIBUTION = {
  tops: { men: 3, women: 2 },
  dresses: { men: 0, women: 5 },
  bottoms: { men: 3, women: 2 },
  outerwear: { men: 3, women: 2 },
  ethnic_wear: { men: 1, women: 4 },
  accessories: { men: 5, women: 0 },
};

module.exports = { DEMO_LISTINGS, EXPECTED_DISTRIBUTION };
