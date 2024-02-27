const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const app = express()
const jsonMiddleware = express.json()
app.use(jsonMiddleware)
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
let db = null

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

const initializeDbAndServer = async () => {
  try {
    db = await open({filename: dbPath, driver: sqlite3.Database})
    console.log('Database connected')

    app.listen(3000, () => {
      console.log('Server is running at http://localhost:3000')
    })
  } catch (error) {
    console.error(`Error connecting to database: ${error.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

// User Register

app.post('/register', async (req, res) => {
  const {username, name, password, gender, location} = req.body
  const hashedPassword = await bcrypt.hash(password, 10)
  try {
    const userExistsQuery = 'SELECT * FROM user WHERE username = ?'
    const dbUser = await db.get(userExistsQuery, [username])

    if (dbUser !== undefined) {
      return res.status(400).send('User already exists')
    }

    if (password.length < 5) {
      return res.status(400).send('Password too short')
    }

    const insertUserQuery = `
            INSERT INTO user(username, name, password, gender, location)
            VALUES (?, ?, ?, ?, ?)
        `
    await db.run(insertUserQuery, [
      username,
      name,
      hashedPassword,
      gender,
      location,
    ])
    res.send('User created successfully')
  } catch (err) {
    console.error(`Error creating user: ${err.message}`)
    res.status(500).send('Internal Server Error')
  }
})

const verifyUserMiddleware = async (req, res, next) => {
  let jwtToken
  try {
    const authHeader = req.headers['authorization']

    if (authHeader === undefined) {
      return res.status(401).send('Invalid JWT Token')
    }

    jwtToken = authHeader.split(' ')[1]
    jwt.verify(jwtToken, 'abcdefghi', (error, payload) => {
      if (error) {
        return res.status(401).send('Invalid JWT Token')
      } else {
        req.customData = {message: 'User Identified'}
        req.username = payload.username
        next()
      }
    })
  } catch (error) {
    console.error(`Error verifying user: ${error.message}`)
    res.status(500).send('Internal Server Error')
  }
}

app.post('/login', async (req, res) => {
  const {username, password} = req.body
  try {
    const selectUserQuery = 'SELECT * FROM user WHERE username = ?'
    const dbUser = await db.get(selectUserQuery, [username])

    if (!dbUser) {
      return res.status(400).send('Invalid user')
    }

    const isPasswordMatch = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatch) {
      const payload = {username: username}
      let jwtToken = jwt.sign(payload, 'abcdefghi')
      res.send({jwtToken})
    } else {
      res.status(400).send('Invalid password')
    }
  } catch (error) {
    console.error(`Error logging in: ${error.message}`)
    res.status(500).send('Internal Server Error')
  }
})

// API 2
app.get('/states', verifyUserMiddleware, async (req, res) => {
  const allQuery =
    'SELECT state_id AS stateId, state_name AS stateName, population FROM state ORDER BY state_id'
  try {
    const statesList = await db.all(allQuery)
    res.send(statesList)
  } catch (error) {
    console.error(`Error getting states: ${error.message}`)
    res.status(500).send('Internal Server Error')
  }
})
//API3
app.get('/states/:stateId/', verifyUserMiddleware, async (req, res) => {
  const {stateId} = req.params
  const query = `select state_id as stateId, state_name as stateName, population from state where state_id=?`
  try {
    const dbresponse = await db.get(query, [stateId])
    res.send(dbresponse)
  } catch (err) {
    console.log(`Err in fetching: ${err.message}`)
    res.status(500).send('Internal server Error')
  }
})
// API 4
app.post('/districts/', verifyUserMiddleware, async (req, res) => {
  const {districtName, stateId, cases, cured, active, deaths} = req.body
  const insertQuery = `
    INSERT INTO district (district_name, state_id, cases, cured, active, deaths)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  try {
    await db.run(insertQuery, [
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    ])
    res.send('District Successfully Added')
  } catch (err) {
    console.log(`Error adding district: ${err.message}`)
    res.status(500).send('Internal Server Error')
  }
})

// API 5
app.get('/districts/:districtId/', verifyUserMiddleware, async (req, res) => {
  const {districtId} = req.params
  const distquery = `SELECT district_id AS districtId, district_name AS districtName, state_id AS stateId, cases, cured, active, deaths FROM district WHERE district_id=?`
  try {
    const dbresponse = await db.get(distquery, [districtId])
    if (!dbresponse) {
      return res.status(404).send('District not found')
    }
    res.send(dbresponse)
  } catch (err) {
    console.log(`Error in getting district details: ${err.message}`)
    res.status(500).send('Internal server Error')
  }
})
// API 6
app.delete(
  '/districts/:districtId/',
  verifyUserMiddleware,
  async (req, res) => {
    const {districtId} = req.params
    const deleteQuery = `DELETE FROM district WHERE district_id=?`
    try {
      await db.run(deleteQuery, [districtId])
      res.send('District Removed')
    } catch (err) {
      console.log(`Error deleting district: ${err.message}`)
      res.status(500).send('Internal Server Error')
    }
  },
)

// API 7
app.put('/districts/:districtId/', verifyUserMiddleware, async (req, res) => {
  const {districtId} = req.params
  const {districtName, stateId, cases, cured, active, deaths} = req.body
  const updateQuery = `
    UPDATE district
    SET district_name=?, state_id=?, cases=?, cured=?, active=?, deaths=?
    WHERE district_id=?
  `
  try {
    await db.run(updateQuery, [
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
      districtId,
    ])
    res.send('District Details Updated')
  } catch (err) {
    console.log(`Error updating district: ${err.message}`)
    res.status(500).send('Internal Server Error')
  }
})

// API 8
app.get('/states/:stateId/stats/', verifyUserMiddleware, async (req, res) => {
  const {stateId} = req.params
  const totalQuery = `
    SELECT 
      SUM(cases) AS cases,
      SUM(cured) AS cured,
      SUM(active) AS active,
      SUM(deaths) AS deaths
    FROM district
    WHERE state_id = ${stateId}
  `

  try {
    const totalQueryList = await db.all(totalQuery)
    console.log(totalQueryList)
    if (totalQueryList.length === 0) {
      return res.status(404).send('Stats not found for the state')
    }
    const dbResponse = totalcount(totalQueryList[0]) // Access the first element
    res.send(dbResponse)
  } catch (err) {
    console.log(`Error in counting: ${err.message}`)
    res.status(500).send('Internal Error')
  }
})
function totalcount(state) {
  return {
    totalCases: state.cases,
    totalCured: state.cured,
    totalActive: state.active,
    totalDeaths: state.deaths,
  }
}
module.exports = app
