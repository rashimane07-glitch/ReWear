// MOCK listings – not saved anywhere. Replaced by the Express/Cloudant API later.
const s = (name, college, bio = 'Student seller') => ({ name, college, bio })
export const listings = [
  { id: 1, name: 'Vintage Mocha Blazer', images: ['/images/p1.jpg'], category: 'Formal Wear', gender: 'Women', condition: 'Like new', size: 'M', price: 780, originalPrice: 2199, listingType: 'sell', listedAt: 8, seller: s('Aanya S.', 'North Campus'), description: 'Structured single-breasted blazer in a warm mocha shade. Worn twice for presentations. Lined, no marks or loose threads.' },
  { id: 2, name: 'Cable Knit Sweater', images: ['/images/p2.jpg'], category: 'Casual Wear', gender: 'Unisex', condition: 'Excellent', size: 'S', price: 520, originalPrice: 1499, listingType: 'sell', listedAt: 7, seller: s('Meher K.', 'Hauz Khas'), description: 'Soft ivory cable knit, relaxed fit. Machine washed gently, no pilling.' },
  { id: 3, name: 'Classic Trench Coat', images: ['/images/p3.jpg'], category: 'Western Wear', gender: 'Women', condition: 'Like new', size: 'M', listingType: 'exchange', lookingFor: 'Knitwear, jackets · Size M', listedAt: 6, seller: s('Rhea M.', 'Miranda House'), description: 'Mid-length trench in grey-taupe with belt. Looking to swap for knitwear or a light jacket.' },
  { id: 4, name: 'Everyday Denim Edit', images: ['/images/p4.jpg'], category: 'Casual Wear', gender: 'Women', condition: 'Good', size: '28', listingType: 'donate', listedAt: 5, seller: s('Kiara P.', 'Vasant Kunj'), description: 'Two pairs of well-loved straight-leg jeans. Free to anyone who will wear them.' },
  { id: 5, name: 'Leather Ankle Boots', images: ['/images/p5.jpg'], category: 'Accessories', gender: 'Unisex', condition: 'Excellent', size: 'EU 38', price: 890, originalPrice: 2499, listingType: 'sell', listedAt: 4, seller: s('Sara A.', 'South Campus'), description: 'Tan leather lace-up boots with plenty of life left. Resoled last year.' },
  { id: 6, name: 'Minimal Ivory Shirt', images: ['/images/p6.jpg'], category: "Men's Fashion", gender: 'Men', condition: 'Like new', size: 'L', price: 440, originalPrice: 1199, listingType: 'sell', listedAt: 3, seller: s('Dev R.', 'Ashoka Uni'), description: 'Crisp cotton shirt, worn once. Easy to dress up or down.' },
  { id: 7, name: 'Rose Tailored Jacket', images: ['/images/p7.jpg'], category: 'Western Wear', gender: 'Women', condition: 'Excellent', size: 'S', listingType: 'exchange', lookingFor: 'Dresses, kurtas · Size S', listedAt: 2, seller: s('Mira N.', 'Lodhi Road'), description: 'Tailored blazer-style jacket in dusty rose. Open to swaps for dresses or kurtas.' },
  { id: 8, name: 'Tan Leather Duo', images: ['/images/p8.jpg'], category: 'Accessories', gender: 'Unisex', condition: 'Good', size: 'One size', price: 560, originalPrice: 1599, listingType: 'sell', listedAt: 1, seller: s('Naina J.', 'Gargi College'), description: 'Leather belt and boots set in matching tan. Some natural wear, sold as a pair.' },
]
export const FILTER_OPTIONS = {
  categories: ['Western Wear', 'Ethnic Wear', 'Casual Wear', 'Formal Wear', 'Accessories', "Men's Fashion"],
  sizes: ['XS', 'S', 'M', 'L', 'XL'],
  conditions: ['New with tags', 'Like new', 'Excellent', 'Good'],
  types: [['sell', 'For sale'], ['exchange', 'For exchange'], ['donate', 'Donation']],
  maxPrice: 2500,
}
