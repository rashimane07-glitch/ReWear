// MOCK DATA – not saved anywhere. Replaced by the Express/Cloudant API later (see services/api.js).
// Put your photos in /public/images using these file names (export them from Figma or use your own).
export const categories = [
  { name: 'Western Wear', image: '/images/cat-western.jpg' },
  { name: 'Ethnic Wear', image: '/images/cat-ethnic.jpg' },
  { name: 'Casual Wear', image: '/images/cat-casual.jpg' },
  { name: 'Formal Wear', image: '/images/cat-formal.jpg' },
  { name: 'Accessories', image: '/images/cat-accessories.jpg' },
  { name: "Men's Fashion", image: '/images/cat-men.jpg' },
]

export const products = [
  { id: 1, name: 'Vintage Mocha Blazer', image: '/images/p1.jpg', condition: 'Like new', size: 'M', price: 780, originalPrice: 2199, listingType: 'sell', seller: { name: 'Aanya S.', college: 'North Campus' } },
  { id: 2, name: 'Cable Knit Sweater', image: '/images/p2.jpg', condition: 'Excellent', size: 'S', price: 520, originalPrice: 1499, listingType: 'sell', seller: { name: 'Meher K.', college: 'Hauz Khas' } },
  { id: 3, name: 'Classic Trench Coat', image: '/images/p3.jpg', condition: 'Like new', size: 'M', listingType: 'exchange', seller: { name: 'Rhea M.', college: 'Miranda House' } },
  { id: 4, name: 'Everyday Denim Edit', image: '/images/p4.jpg', condition: 'Good', size: '28', listingType: 'donate', seller: { name: 'Kiara P.', college: 'Vasant Kunj' } },
]

// Verify each figure against its source before launch.
export const impactStats = [
  { value: '92M', label: 'tonnes of textile waste', note: 'are created globally each year.', source: 'Global Fashion Agenda / Niinimäki et al., 2020' },
  { value: '44%', label: 'lower emissions', note: 'if clothing were worn twice as long.', source: 'Ellen MacArthur Foundation, A New Textiles Economy, 2017' },
  { value: '<1%', label: 'recycled into new clothes', note: 'of material used to make clothing.', source: 'Ellen MacArthur Foundation, A New Textiles Economy, 2017' },
]
