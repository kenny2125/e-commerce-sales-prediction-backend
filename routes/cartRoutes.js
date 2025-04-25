const express = require('express');
const router = express.Router();
const db = require('../db/db');
const auth = require('../middleware/auth');
const { getProductDetails } = require('../models/product');
const { getVariantDetails } = require('../models/productVariant');

// Get user's cart items
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const cartItems = await db('cart').where({ user_id: userId }).select('*');
    res.json(cartItems);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add item to cart
router.post('/add', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id, quantity = 1 } = req.body;

    if (!product_id) {
      return res.status(400).json({ message: 'Product ID is required' });
    }

    const [cartItem] = await db('cart').insert({ user_id: userId, product_id, quantity }).returning('*');
    res.status(201).json(cartItem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update item quantity in cart
router.put('/update/:productId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ message: 'Valid quantity is required' });
    }

    const [cartItem] = await db('cart').where({ user_id: userId, product_id: productId }).update({ quantity }).returning('*');
    if (!cartItem) {
      return res.status(404).json({ message: 'Cart item not found' });
    }
    res.json(cartItem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove item from cart
router.delete('/remove/:productId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    const cartItem = await db('cart').where({ user_id: userId, product_id: productId }).del();
    if (!cartItem) {
      return res.status(404).json({ message: 'Cart item not found' });
    }
    res.json({ message: 'Item removed from cart' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear cart
router.delete('/clear', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    await db('cart').where({ user_id: userId }).del();
    res.json({ message: 'Cart cleared successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get variant details for products in cart
 * Accepts array of {product_id, sku} objects
 */
router.post('/variant-details', async (req, res) => {
    try {
        const { items } = req.body;
        
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ message: 'Invalid request format. Expected array of items.' });
        }

        // Create a batch query to fetch all requested product variants
        const results = await Promise.all(
            items.map(async (item) => {
                try {
                    // Validate item structure
                    if (!item.product_id) {
                        return null; // Skip invalid items
                    }

                    // Get basic product info
                    const product = await getProductDetails(item.product_id);
                    if (!product) {
                        return null; // Product not found
                    }

                    // Get variant-specific details if SKU provided
                    if (item.sku) {
                        const variant = await getVariantDetails(item.product_id, item.sku);
                        if (!variant) {
                            // Variant not found, but product exists
                            return {
                                product_id: product.product_id,
                                sku: item.sku || 'default',
                                product_name: product.product_name,
                                variant_name: null,
                                store_price: product.store_price,
                                image_url: product.image_url,
                                stock: product.quantity
                            };
                        }
                        
                        // Return variant info
                        return {
                            product_id: product.product_id,
                            sku: variant.sku,
                            product_name: product.product_name,
                            variant_name: variant.variant_name,
                            store_price: variant.store_price,
                            image_url: variant.image_url || product.image_url,
                            stock: variant.quantity
                        };
                    } 
                    
                    // No SKU provided - return base product (default variant)
                    return {
                        product_id: product.product_id,
                        sku: 'default',
                        product_name: product.product_name,
                        variant_name: null,
                        store_price: product.store_price,
                        image_url: product.image_url,
                        stock: product.quantity
                    };
                } catch (error) {
                    console.error('Error processing item:', item, error);
                    return null;
                }
            })
        );

        // Filter out null results and return
        const validResults = results.filter(result => result !== null);
        res.json(validResults);
    } catch (error) {
        console.error('Error fetching variant details:', error);
        res.status(500).json({ message: 'Error fetching product variant details' });
    }
});

module.exports = router;