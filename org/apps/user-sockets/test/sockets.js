import chai from 'chai'
import client from 'socket.io-client'
import jwt from 'jsonwebtoken'
import config from '../src/config'
import sockets from '../src/sockets'
import {AUTHENTICATED_DYNAMIC_ROOM_NAMESPACES, AUTHENTICATED_ROOMS, UNAUTHENTICATED_ROOMS} from '../src/constants/rooms'
import {SOCKET_EMIT_EVENTS, SOCKET_ON_EVENTS} from '../src/constants/socket_events'
import app from '../src/app'

chai.should()

describe('Socket Messages', () => {
  let socketServer, server
  const sinon = require('sinon').createSandbox()

  before(async () => {
    ({httpServer: server, socketServer} = await app.start())
  })

  afterEach(async () => {
    sinon.restore()
  })

  after(async () => {
    await server.server.stop()
    await socketServer.close()
  })

  describe('When user connects to the socket', () => {
    describe('with invalid token', () => {
      it('should disconnect', async () => {
        let user = {
          id: '0fcc8ad1-444b-4495-be54-d70a72906e74',
          scope: ['client']
        }
        let token = jwt.sign(user, '123')
        let con = client(`http://localhost:${config.socket.port}?token=${token}`)

        await new Promise((resolve) => {
          con.on('error', async (e) => {
            e.should.be.equal('Authentication error')
            resolve()
          })
        })
      })
    })
    describe('with no token', () => {
      it('should connect', async () => {
        let con = client(`http://localhost:${config.socket.port}`)

        await new Promise((resolve) => {
          con.on(SOCKET_EMIT_EVENTS.CONNECTED, async () => {
            resolve()
          })
        })
      })
    })

    describe('with admin token', () => {
      it('should join them to the admin channel', async () => {
        let user = {
          id: '0fcc8ad1-444b-4495-be54-d70a72906e74',
          scope: ['admin']
        }
        let token = jwt.sign(user, config.jwtSecret)
        let con = client(`http://localhost:${config.socket.port}?token=${token}`)
        await new Promise((resolve) => {
          con.on(SOCKET_EMIT_EVENTS.CONNECTED, async () => {
            let count = 0
            con.on(SOCKET_EMIT_EVENTS.JOINED_ROOM, ({room}) => {
              count++ === 0 ? room.should.be.equal(AUTHENTICATED_ROOMS.ADMINS) : room.should.be.equal(`user-${user.id}`)
              if (count === 2) {
                resolve()
              }
            })
          })
        })
        con.close()
      })
    })
    describe('with client token', () => {
      it('should join them to client channel', async () => {
        let user = {
          id: '0fcc8ad1-444b-4495-be54-d70a72906e74',
          scope: ['client']
        }
        let token = jwt.sign(user, config.jwtSecret)
        let con = client(`http://localhost:${config.socket.port}?token=${token}`)
        await new Promise((resolve) => {
          con.on(SOCKET_EMIT_EVENTS.CONNECTED, async () => {
            let count = 0
            con.on(SOCKET_EMIT_EVENTS.JOINED_ROOM, ({room}) => {
              count++ === 0 ? room.should.be.equal(AUTHENTICATED_ROOMS.CLIENTS) : room.should.be.equal(`user-${user.id}`)
              if (count === 2) {
                resolve()
              }
            })
          })
        })
        con.close()
      })
    })
    describe('with trader token', () => {
      it('should join them to the trader channel', async () => {
        let user = {
          id: '0fcc8ad1-444b-4495-be54-d70a72906e74',
          scope: ['trader']
        }
        let token = jwt.sign(user, config.jwtSecret)
        let con = client(`http://localhost:${config.socket.port}?token=${token}`)
        await new Promise((resolve) => {
          con.on(SOCKET_EMIT_EVENTS.CONNECTED, async () => {
            let count = 0
            con.on(SOCKET_EMIT_EVENTS.JOINED_ROOM, ({room}) => {
              count++ === 0 ? room.should.be.equal(AUTHENTICATED_ROOMS.TRADERS) : room.should.be.equal(`user-${user.id}`)
              if (count === 2) {
                resolve()
              }
            })
          })
        })
        con.close()
      })
    })
  })

  describe('When user subscribes to unauthenticated channel', () => {
    describe('via subscribe', () => {
      describe('and channel DNE', () => {
        it('should receive error event', async () => {
          const con = client(`http://localhost:${config.socket.port}`)

          await new Promise((resolve) => {
            con.on(SOCKET_EMIT_EVENTS.CONNECTED, async () => {
              con.emit(SOCKET_ON_EVENTS.SUBSCRIBE, {
                method: 'POST',
                data: {channel: 'example'}
              })
            })
            con.on(SOCKET_EMIT_EVENTS.SUBSCRIBE_ERROR, async (body) => {
              body.should.be.deep.equal({
                data: {
                  message: `Could not subscribe: channel 'example' not supported`
                }
              })
              resolve()
            })
          })
        })
      })
      describe('and channel exists', () => {
        it('should receive subscribed event', async () => {
          const con = client(`http://localhost:${config.socket.port}`)
          const channelName = UNAUTHENTICATED_ROOMS.ASSETS_CURRENT_QUOTES__PUBLIC
          await new Promise((resolve) => {
            con.on(SOCKET_EMIT_EVENTS.CONNECTED, async () => {
              con.emit(SOCKET_ON_EVENTS.SUBSCRIBE, {
                method: 'POST',
                data: {channel: channelName}
              })
            })
            con.on(SOCKET_EMIT_EVENTS.SUBSCRIBED, (body) => {
              body.should.be.deep.equal({
                data: {channel: channelName}
              })
              resolve()
            })
          })
        })
      })
    })
  })

  describe('When user unsubscribes from unauthenticated channel', () => {
    describe('via unsubscribe', () => {
      describe('and channel DNE', () => {
        it('should receive error event', async () => {
          const con = client(`http://localhost:${config.socket.port}`)

          await new Promise((resolve) => {
            con.on(SOCKET_EMIT_EVENTS.CONNECTED, async () => {
              con.emit(SOCKET_ON_EVENTS.SUBSCRIBE, {
                method: 'DELETE',
                data: {channel: 'example'}
              })
            })
            con.on(SOCKET_EMIT_EVENTS.SUBSCRIBE_ERROR, async (body) => {
              body.should.be.deep.equal({
                data: {
                  message: `Could not unsubscribe: channel 'example' not supported`
                }
              })
              resolve()
            })
          })
        })
      })
      describe('and channel exists', () => {
        it('should receive subscribed event', async () => {
          const con = client(`http://localhost:${config.socket.port}`)
          const channelName = UNAUTHENTICATED_ROOMS.ASSETS_CURRENT_QUOTES__PUBLIC
          await new Promise((resolve) => {
            con.on(SOCKET_EMIT_EVENTS.CONNECTED, async () => {
              con.emit(SOCKET_ON_EVENTS.SUBSCRIBE, {
                method: 'DELETE',
                data: {channel: channelName}
              })
            })
            con.on(SOCKET_EMIT_EVENTS.UNSUBSCRIBED, (body) => {
              body.should.be.deep.equal({
                data: {channel: channelName}
              })
              resolve()
            })
          })
        })
      })
    })
  })

  describe('When user requests to be added to a room', () => {
    describe('via joinRoom', () => {
      it('should allow them to receive messages to that room', async () => {
        let user = {
          id: '0fcc8ad1-444b-4495-be54-d70a72906e74',
          scope: ['client']
        }
        let token = jwt.sign(user, config.jwtSecret)
        let con = client(`http://localhost:${config.socket.port}?token=${token}`)

        await new Promise((resolve) => {
          con.on(SOCKET_EMIT_EVENTS.CONNECTED, async () => {
            setTimeout(() => {
              con.emit(SOCKET_ON_EVENTS.JOIN_ROOM, {room: 'test'})
              con.on(SOCKET_EMIT_EVENTS.JOINED_ROOM, ({room}) => {
                room.should.be.equal('test')
                resolve()
              })
            }, 10)
          })
        })

        let res = new Promise((resolve) => {
          con.on('test-event', (message) => {
            message.text.should.be.equal('test event message')
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
            event: 'test-event',
            message: {text: 'test event message'}
          }
        })

        // leaves room
        await new Promise((resolve) => {
          con.emit(SOCKET_ON_EVENTS.LEAVE_ROOM, {room: 'test'})
          con.on(SOCKET_EMIT_EVENTS.LEFT_ROOM, ({room}) => {
            room.should.be.equal('test')
            resolve()
          })
        })

        con.close()

        await res
      })
    })

    describe('via POST', () => {
      it('should allow them to receive messages to that room', async () => {
        let user = {
          id: '0fcc8ad1-444b-4495-be54-d70a72906e74',
          scope: ['client']
        }
        let token = jwt.sign(user, config.jwtSecret)
        let con = client(`http://localhost:${config.socket.port}?token=${token}`)
        const channelName = `${AUTHENTICATED_DYNAMIC_ROOM_NAMESPACES.SEM_INSTRUMENT_PRICES_NAMESPACE}:bitmex:btc-1231`

        await new Promise((resolve) => {
          con.on(SOCKET_EMIT_EVENTS.CONNECTED, async () => {
            con.emit(SOCKET_ON_EVENTS.SUBSCRIBE, {
              method: 'POST',
              data: {channel: channelName}
            })
            con.on(SOCKET_EMIT_EVENTS.SUBSCRIBED, (body) => {
              body.should.be.deep.equal({
                data: {channel: channelName}
              })
              resolve()
            })
          })
        })

        let res = new Promise((resolve) => {
          con.on('test-event', (message) => {
            message.text.should.be.equal('test event message')
            resolve()
          })
        })

        await server.server.inject({
          method: 'POST',
          url: `/rooms/${channelName}`,
          auth: {
            strategy: 'jwt',
            credentials: {
              id: 1
            }
          },
          payload: {
            event: 'test-event',
            message: {text: 'test event message'}
          }
        })

        // leaves room
        await new Promise((resolve) => {
          con.emit(SOCKET_ON_EVENTS.SUBSCRIBE, {
            method: 'DELETE',
            data: {channel: channelName}
          })
          con.on(SOCKET_EMIT_EVENTS.UNSUBSCRIBED, (body) => {
            body.should.be.deep.equal({
              data: {channel: channelName}
            })
            resolve()
          })
        })

        con.close()

        await res
      })
    })

    describe('for an authenticated room', () => {
      it('should return permissionError and not join them to the room', async () => {
        let user = {
          id: '0fcc8ad1-444b-4495-be54-d70a72906e74',
          scope: ['client']
        }
        let token = jwt.sign(user, config.jwtSecret)
        let con = client(`http://localhost:${config.socket.port}?token=${token}`)

        await new Promise((resolve) => {
          con.on(SOCKET_EMIT_EVENTS.CONNECTED, async () => {
            resolve()
          })
        })

        for (let room of Object.values(AUTHENTICATED_ROOMS)) {
          await new Promise((resolve, reject) => {
            con.emit(SOCKET_ON_EVENTS.JOIN_ROOM, {room})
            // eslint-disable-next-line no-unused-vars
            con.on(SOCKET_EMIT_EVENTS.JOINED_ROOM, ({room}) => {
              reject()
            })
            // eslint-disable-next-line no-unused-vars
            con.on(SOCKET_EMIT_EVENTS.PERMISSION_ERROR, ({room}) => {
              resolve()
            })
          })
        }
      })
    })
  })

  describe('emitToRooms()', () => {
    beforeEach(async () => {
      await sinon.stub(sockets, 'emitToSocketId').returns({})
    })
    describe('is called for multiple rooms that each contain the same client', () => {
      it('should only send one message', async () => {
        let user = {
          id: '0fcc8ad1-444b-4495-be54-d70a72906e74',
          scope: ['admin', 'market_data']
        }
        let token = jwt.sign(user, config.jwtSecret)
        let con = client(`http://localhost:${config.socket.port}?token=${token}`)
        await new Promise((resolve) => {
          con.on(SOCKET_EMIT_EVENTS.CONNECTED, async () => {
            await sockets.emitToRooms([AUTHENTICATED_ROOMS.ADMINS, AUTHENTICATED_ROOMS.MARKET_DATA], SOCKET_EMIT_EVENTS.FUTURE_CONTRACT, {
              method: 'POST',
              data: {
                symbol: 'XBTH21',
                data_source: 'ftx',
                price: '30000.00000000',
                price_daily_change: '3000.00000000',
                price_daily_change_percentage: '0.11111',
                listed_at: null,
                expires_at: new Date().toISOString(),
                is_deleted: false
              }
            })
            sockets.emitToSocketId.callCount.should.be.equal(1)
            resolve()
          })
        })
        con.close()
      })
    })
  })
})
