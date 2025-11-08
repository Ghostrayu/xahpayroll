const express = require('express')
const router = express.Router()
const { query } = require('../database/db')

/**
 * POST /api/users/profile
 * Create or update user profile
 */
router.post('/profile', async (req, res) => {
  try {
    const { walletAddress, displayName, organizationName, email, phoneNumber, userType } = req.body

    // Validate required fields
    if (!walletAddress || !displayName || !userType) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Missing required fields: walletAddress, displayName, userType'
        }
      })
    }

    // Validate user type
    if (!['employee', 'ngo', 'employer'].includes(userType)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid userType. Must be: employee, ngo, or employer'
        }
      })
    }

    // Validate organization name for NGO/Employer
    if ((userType === 'ngo' || userType === 'employer') && !organizationName) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Organization name is required for NGO/Employer accounts'
        }
      })
    }

    // Validate email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid email format'
        }
      })
    }

    // Check if wallet address already exists
    const existingUserResult = await query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [walletAddress]
    )
    
    const existingUser = existingUserResult.rows[0]
    
    if (existingUser) {
      // Check if trying to change from employee to ngo/employer or vice versa
      const isEmployeeType = userType === 'employee'
      const isOrgType = userType === 'ngo' || userType === 'employer'
      const wasEmployeeType = existingUser.user_type === 'employee'
      const wasOrgType = existingUser.user_type === 'ngo' || existingUser.user_type === 'employer'

      // Prevent switching between employee and organization types
      if ((isEmployeeType && wasOrgType) || (isOrgType && wasEmployeeType)) {
        return res.status(409).json({
          success: false,
          error: {
            message: `This wallet address is already registered as ${existingUser.user_type === 'employee' ? 'an Employee' : 'an NGO/Employer'}. A wallet address cannot be associated with both Employee and NGO/Employer accounts.`,
            existingUserType: existingUser.user_type,
            attemptedUserType: userType
          }
        })
      }
      
      // Update existing user
      const updateResult = await query(
        `UPDATE users 
         SET display_name = $1, organization_name = $2, email = $3, phone_number = $4, user_type = $5
         WHERE wallet_address = $6
         RETURNING *`,
        [displayName, organizationName || null, email || null, phoneNumber || null, userType, walletAddress]
      )
      
      const userProfile = updateResult.rows[0]
      console.log('Profile updated for wallet:', walletAddress)
      
      res.json({
        success: true,
        data: {
          profile: {
            walletAddress: userProfile.wallet_address,
            displayName: userProfile.display_name,
            organizationName: userProfile.organization_name,
            email: userProfile.email,
            phoneNumber: userProfile.phone_number,
            userType: userProfile.user_type,
            createdAt: userProfile.created_at,
            updatedAt: userProfile.updated_at
          },
          message: 'Profile updated successfully'
        }
      })
    } else {
      // Create new user
      const insertResult = await query(
        `INSERT INTO users (wallet_address, display_name, organization_name, email, phone_number, user_type)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [walletAddress, displayName, organizationName || null, email || null, phoneNumber || null, userType]
      )
      
      const userProfile = insertResult.rows[0]
      console.log('Profile created for wallet:', walletAddress)
      
      res.json({
        success: true,
        data: {
          profile: {
            walletAddress: userProfile.wallet_address,
            displayName: userProfile.display_name,
            organizationName: userProfile.organization_name,
            email: userProfile.email,
            phoneNumber: userProfile.phone_number,
            userType: userProfile.user_type,
            createdAt: userProfile.created_at,
            updatedAt: userProfile.updated_at
          },
          message: 'Profile created successfully'
        }
      })
    }
  } catch (error) {
    console.error('Error saving user profile:', error)
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to save user profile'
      }
    })
  }
})

/**
 * GET /api/users/profile/:walletAddress
 * Get user profile by wallet address
 */
router.get('/profile/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Wallet address is required'
        }
      })
    }

    const result = await query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [walletAddress]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User profile not found'
        }
      })
    }

    const userProfile = result.rows[0]

    res.json({
      success: true,
      data: {
        profile: {
          walletAddress: userProfile.wallet_address,
          displayName: userProfile.display_name,
          organizationName: userProfile.organization_name,
          email: userProfile.email,
          phoneNumber: userProfile.phone_number,
          userType: userProfile.user_type,
          createdAt: userProfile.created_at,
          updatedAt: userProfile.updated_at
        }
      }
    })
  } catch (error) {
    console.error('Error fetching user profile:', error)
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to fetch user profile'
      }
    })
  }
})

/**
 * GET /api/users/list
 * Get all users (for admin/testing purposes)
 */
router.get('/list', async (req, res) => {
  try {
    const result = await query('SELECT * FROM users ORDER BY created_at DESC')
    
    const allUsers = result.rows.map(user => ({
      walletAddress: user.wallet_address,
      displayName: user.display_name,
      organizationName: user.organization_name,
      email: user.email,
      phoneNumber: user.phone_number,
      userType: user.user_type,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    }))

    res.json({
      success: true,
      data: {
        users: allUsers,
        count: allUsers.length
      }
    })
  } catch (error) {
    console.error('Error listing users:', error)
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to list users'
      }
    })
  }
})

module.exports = router
