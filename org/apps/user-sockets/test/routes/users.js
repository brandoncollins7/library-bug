import config from '../../src/config'
import chai from 'chai'
import client from 'socket.io-client'
import jwt from 'jsonwebtoken'
import app from '../../src/app'

chai.should()

describe('User routes', () => {
  let socketServer, server
  const sinon = require('sinon').createSandbox()

  before(async () => {
    ({httpServer: server, socketServer} = await app.start())
  })

  afterEach(async () => {})

  after(async () => {
    await server.server.stop()
    await socketServer.close()
  })

  describe('When an admin requests to send a message to a specific user', () => {
    describe('and that user is connected', () => {
      it('should send the message', async () => {
        let user = {
          id: '0fcc8ad1-444b-4495-be54-d70a72906e74',
          scope: ['client']
        }
        let token = jwt.sign(user, config.jwtSecret)
        let con = client(`http://localhost:${config.socket.port}?token=${token}`)

        await new Promise((resolve, reject) => {
          con.on('connected', async () => {
            con.on('test', (message) => {
              message.text.should.be.equal('hello')
              con.close()
              resolve()
            })

            let result = await server.server.inject({
              method: 'POST',
              url: `/users/0fcc8ad1-444b-4495-be54-d70a72906e74`,
              auth: {
                strategy: 'jwt',
                credentials: {
                  id: 1
                }
              },
              payload: {
                event: 'test',
                message: {text: 'hello'}
              }
            })

            result.statusCode.should.be.equal(200)
          })
        })
      })

      describe('and that user is not connected', () => {
        it('not return an error', async () => {
          let result = await server.server.inject({
            method: 'POST',
            url: `/users/0fcc8ad1-444b-4495-be54-d70a72906e74`,
            auth: {
              strategy: 'jwt',
              credentials: {
                id: 1
              }
            },
            payload: {
              event: 'test',
              message: {text: 'hello'}
            }
          })

          result.statusCode.should.be.equal(200)
        })
      })
    })
  })

  describe('When an admin requests to send a message to a client room', () => {
    it('should sent the message to all connected clients', async () => {
      let user = {
        id: '0fcc8ad1-444b-4495-be54-d70a72906e74',
        scope: ['client']
      }
      let token = jwt.sign(user, config.jwtSecret)
      let con = client(`http://localhost:${config.socket.port}?token=${token}`)

      let user2 = {
        id: 'f5698979-765c-4e10-bbdc-2f059e8b7b42',
        scope: ['client']
      }
      let token2 = jwt.sign(user2, config.jwtSecret)
      let con2 = client(`http://localhost:${config.socket.port}?token=${token2}`)

      await Promise.all([
        new Promise((resolve) => {
          con.on('connected', async () => {
            resolve()
          })
        }),
        new Promise((resolve) => {
          con2.on('connected', async () => {
            resolve()
          })
        })
      ])

      let message = Promise.all([
        new Promise((resolve) => {
          con.on('test', async (message) => {
            message.text.should.be.equal('hello')
            con.close()
            resolve()
          })
        }),
        new Promise((resolve) => {
          con2.on('test', async (message) => {
            message.text.should.be.equal('hello')
            con2.close()
            resolve()
          })
        })
      ])

      let result = await server.server.inject({
        method: 'POST',
        url: `/rooms/clients`,
        auth: {
          strategy: 'jwt',
          credentials: {
            id: 1
          }
        },
        payload: {
          event: 'test',
          message: {text: 'hello'}
        }
      })

      await message
    })
  })

  describe('When an admin requests add a user to a room', () => {
    it('should add them to the room and receive the room messages', async () => {
      let user = {
        id: '0fcc8ad1-444b-4495-be54-d70a72906e74',
        scope: ['client']
      }
      let token = jwt.sign(user, config.jwtSecret)
      let con = client(`http://localhost:${config.socket.port}?token=${token}`)

      await new Promise((resolve) => {
        con.on('connected', async () => {
          resolve()
        })
      })

      let result = await server.server.inject({
        method: 'PUT',
        url: `/rooms/test/0fcc8ad1-444b-4495-be54-d70a72906e74`,
        auth: {
          strategy: 'jwt',
          credentials: {
            id: 1
          }
        }
      })

      let res = new Promise((resolve) => {
        con.on('test', (message) => {
          message.text.should.be.equal('message from test room')
          con.close()
          resolve()
        })
      })

      await server.server.inject({
        method: 'POST',
        url: `/rooms/test`,
        auth: {
          strategy: 'jwt',
          credentials: {
            id: 1
          }
        },
        payload: {
          event: 'test',
          message: {text: 'message from test room'}
        }
      })

      con.close()
    })
  })
  describe('When an admin requests remove a user from a room', () => {
    it('should remove them from the room', async () => {
      let user = {
        id: '0fcc8ad1-444b-4495-be54-d70a72906e74',
        scope: ['client']
      }
      let token = jwt.sign(user, config.jwtSecret)
      let con = client(`http://localhost:${config.socket.port}?token=${token}`)

      await new Promise((resolve) => {
        con.on('connected', async () => {
          resolve()
        })
      })

      let leave = new Promise((resolve) => {
        con.on('leftRoom', async () => {
          resolve()
        })
      })

      await server.server.inject({
        method: 'DELETE',
        url: `/rooms/test/0fcc8ad1-444b-4495-be54-d70a72906e74`,
        auth: {
          strategy: 'jwt',
          credentials: {
            id: 1
          }
        }
      })

      await leave

      con.close()
    })
  })
})
