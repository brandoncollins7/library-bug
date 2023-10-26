import {Test, TestingModule} from '@nestjs/testing'
import request from 'supertest'
import {AppModule} from '../../src/app/app.module'
import {LendingScopes} from '@frnt/lending-api/permissions'
import {Scopes} from '@frnt/shared/util/permissions'
import {INestApplication} from '@nestjs/common'
import {getLoan, getToken} from '@frnt/apps/lending-api/support'
import {mock} from 'jest-mock-extended'
import {BitgoMarketService, BitgoWalletInterface, BitgoWalletService, CollateralPublisher, LoanPublisher, MarginCallPublisher, PrismaService} from '@frnt/apps/lending-api/shared'
import PaymentPublisher from '../../src/app/publishers/payment.publisher'
import {CollateralService} from '../../src/app/resources/collateral/collateral.service'
import {BitgoWebhookService} from '../../src/app/resources/loans/bitgo-webhook-service'

const USER_ID = 'e9fba5db-e4da-45a2-9cfd-612e5117bdbe'
const BORROWER_ID = '7f018655-54c9-4e0b-a5b3-7f32502e8817'
const LENDER_ID = '6a8ec441-c6e6-4d34-b594-bfadf1b6f069'

const EXPECTED_FIELDS = [
  'id',
  'amount',
  'lending_currency_code',
  'collateral_requirement_percentage',
  'interest_rate',
  'start_date',
  'end_date',
  'borrower_id',
  'lender_id',
  'wallet_id',
  'enterprise_id',
  'is_deleted',
  'created_at',
  'updated_at',
  'interest_schedules',
  'collateral_wallet_balances',
  'collateral_value_total',
  'is_active',
  'payments',
  'is_active_date',
  'is_principal_repaid',
  'is_principal_repaid_date',
  'is_principal_sent',
  'is_principal_sent_date',
  'is_collateral_defaulted',
  'is_collateral_liquidated',
  'liquidation_date',
  'liquidation_value',
  'collateral_liquidation_percentage',
  'is_automated_liquidations_enabled',
  'is_automated_margin_calls_enabled',
  'interest_rate_penalty',
  'total_interest_rate',
  'is_overcollateralized',
  'is_closed',
  'is_closed_date',
  'is_collateralized',
  'is_principal_funded',
  'is_principal_funded_date',
  'is_collateral_value_locked',
  'time_override'
]

const EXPECTED_FIELDS_ADMIN = [...EXPECTED_FIELDS, 'admin_fee', 'lender', 'borrower']

const EXPECTED_FIELDS_BORROWER = [...EXPECTED_FIELDS, 'borrower']
const EXPECTED_FIELDS_LENDER = [...EXPECTED_FIELDS, 'lender']

describe('LoansController (e2e)', () => {
  let app: INestApplication
  let bitgoWalletService: BitgoWalletInterface
  let prismaService: PrismaService
  let bitgoWebhookService: BitgoWebhookService
  let bitgoMarketService: BitgoMarketService
  let loanPublisher: LoanPublisher
  let marginCallPublisher: MarginCallPublisher

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      providers: []
    })
      .overrideProvider(PaymentPublisher)
      .useValue(mock<PaymentPublisher>())
      .overrideProvider(CollateralPublisher)
      .useValue(mock<CollateralPublisher>())
      .overrideProvider(BitgoWalletService)
      .useValue(mock<BitgoWalletInterface>())
      .overrideProvider(CollateralService)
      .useValue(mock<CollateralService>())
      .overrideProvider(LoanPublisher)
      .useValue(mock<LoanPublisher>())
      .overrideProvider(BitgoWebhookService)
      .useValue(mock<BitgoWebhookService>())
      .overrideProvider(BitgoMarketService)
      .useValue(mock<BitgoMarketService>())
      .overrideProvider(MarginCallPublisher)
      .useValue(mock<MarginCallPublisher>())
      .compile()

    app = moduleFixture.createNestApplication()
    await app.init()

    bitgoWalletService = app.get(BitgoWalletService)
    prismaService = app.get(PrismaService)
    loanPublisher = app.get(LoanPublisher)
    bitgoWebhookService = app.get(BitgoWebhookService)
    bitgoMarketService = app.get(BitgoMarketService)
    loanPublisher = app.get(LoanPublisher)
    marginCallPublisher = app.get(MarginCallPublisher)

    bitgoWebhookService.createWebhook = jest.fn().mockResolvedValue(true)

    loanPublisher.publishCreated = jest.fn().mockResolvedValue(true)
    loanPublisher.publishUpdated = jest.fn().mockResolvedValue(true)
    marginCallPublisher.publishCreatedAndNotifyLoan = jest.fn().mockResolvedValue(true)
    marginCallPublisher.publishUpdatedAndNotifyLoan = jest.fn().mockResolvedValue(true)
  })

  afterEach(async () => {
    await app.close()

    await prismaService.$executeRaw`TRUNCATE TABLE loans CASCADE;`
  })

  describe('/loans (POST) create', () => {
    it('should succeed', async () => {
      const token = getToken(USER_ID, [Scopes.ADMIN])
      bitgoWalletService.generateNewAddress = jest.fn().mockResolvedValue({address: 'test'})

      await request(app.getHttpServer()).post('/loans').send(getLoan()).set('Authorization', token).expect(201)

      const address = await prismaService.collateralWalletAddress.findFirst()
      expect(address.address).toBe('test')

      expect(bitgoWebhookService.createWebhook).toBeCalledTimes(2)
    })
  })

  describe('/loans/:id (GET)', () => {
    describe('as admin', () => {
      it('should succeed', async () => {
        const token = getToken(USER_ID, [Scopes.ADMIN])
        bitgoWalletService.generateNewAddress = jest.fn().mockResolvedValue({address: 'test'})
        const res = await request(app.getHttpServer()).post('/loans').send(getLoan()).set('Authorization', token).expect(201)

        const {body: loan} = await request(app.getHttpServer()).get(`/loans/${res.body.id}`).set('Authorization', token)
        expect(loan).toEqual(expect.objectContaining({id: res.body.id}))
        expect(Object.keys(loan).sort()).toEqual(EXPECTED_FIELDS_ADMIN.sort())
      })
      describe('as a client', () => {
        it('should succeed', async () => {
          const adminToken = getToken(USER_ID, [Scopes.ADMIN])
          const borrowerToken = getToken(BORROWER_ID, [LendingScopes.LENDING_CLIENT.role])
          const lenderToken = getToken(LENDER_ID, [LendingScopes.LENDING_CLIENT.role])

          bitgoWalletService.generateNewAddress = jest.fn().mockResolvedValue({address: 'test'})
          const res = await request(app.getHttpServer()).post('/loans').send(getLoan()).set('Authorization', adminToken).expect(201)

          // BORROWER VIEW
          let {body: loan} = await request(app.getHttpServer()).get(`/loans/${res.body.id}`).set('Authorization', borrowerToken)
          expect(loan).toEqual(expect.objectContaining({id: res.body.id, interest_rate: 12}))
          expect(Object.keys(loan).sort()).toEqual(EXPECTED_FIELDS_BORROWER.sort()) //LENDER VIEW
          ;({body: loan} = await request(app.getHttpServer()).get(`/loans/${res.body.id}`).set('Authorization', lenderToken))

          expect(loan).toEqual(expect.objectContaining({id: res.body.id, interest_rate: 10}))
          expect(Object.keys(loan).sort()).toEqual(EXPECTED_FIELDS_LENDER.sort())
        })
      })
    })
    it('should succeed', async () => {
      const token = getToken(USER_ID, [Scopes.ADMIN])
      bitgoWalletService.generateNewAddress = jest.fn().mockResolvedValue({address: 'test'})

      await request(app.getHttpServer()).post('/loans').send(getLoan()).set('Authorization', token).expect(201)
      const prismaService = app.get(PrismaService)
      const address = await prismaService.collateralWalletAddress.findFirst()
      expect(bitgoWalletService.generateNewAddress).toBeCalledTimes(1)
      expect(address.address).toBe('test')
    })
  })

  describe('/loans (GET) permissions', () => {
    describe('as admin', () => {
      it('should succeed', async () => {
        const token = getToken(USER_ID, [Scopes.ADMIN])

        await request(app.getHttpServer()).get('/loans').set('Authorization', token).expect(200)
      })
    })
    describe('as lending_manager', () => {
      it('should succeed', async () => {
        const token = getToken(USER_ID, [LendingScopes.LENDING_MANAGER.role])

        await request(app.getHttpServer()).get('/loans').set('Authorization', token).expect(200)
      })
    })

    describe('as lending_client', () => {
      it('should succeed', async () => {
        const token = getToken(USER_ID, [LendingScopes.LENDING_CLIENT.role])

        await request(app.getHttpServer()).get('/loans').set('Authorization', token).expect(200)
      })
    })

    describe('as lending_client', () => {
      it('should fail 403', async () => {
        const token = getToken(USER_ID, [Scopes.CLIENT])

        await request(app.getHttpServer()).get('/loans').set('Authorization', token).expect(403)
      })
    })

    describe('as no user', () => {
      it('should fail 401', async () => {
        const token = `Bearer no-auth`

        await request(app.getHttpServer()).get('/loans').set('Authorization', token).expect(401)
      })
    })
  })

  describe('/loans/:id/liquidate POST', () => {
    let loan
    const token = getToken(USER_ID, [Scopes.ADMIN])

    beforeEach(async () => {
      bitgoWalletService.generateNewAddress = jest.fn().mockResolvedValue({address: 'test'})
      bitgoMarketService.placeMarketOrder = jest.fn().mockResolvedValue({data: {status: 'pending_open', id: '123'}})
      bitgoMarketService.getOrder = jest.fn().mockResolvedValue({data: {status: 'completed', filledQuantity: '100000', averagePrice: '10000', id: '123'}})
      ;({body: loan} = await request(app.getHttpServer()).post('/loans').send(getLoan()).set('Authorization', token).expect(201))
    })
    describe('When liquidating a loan', () => {
      describe('for a margin call', () => {
        it('should liquidate the loan', async () => {
          await request(app.getHttpServer()).post(`/loans/${loan.id}/margin-calls`).send({is_warning: true}).set('Authorization', token).expect(201)
          await prismaService.collateralWalletBalance.update({
            where: {
              id: loan.collateral_wallet_balances[0].id
            },
            data: {
              balance: '1000000'
            }
          })
          await request(app.getHttpServer())
            .post(`/loans/${loan.id}/liquidations`)
            .send({
              collateral_currency_code: 'TBTC',
              amount: '100000',
              margin_call_id: 1
            })
            .set('Authorization', token)
            .expect(201)
          const {body: liquidationEvents} = await request(app.getHttpServer()).get(`/loans/${loan.id}/liquidations`).set('Authorization', token)
          expect(liquidationEvents[0]).toEqual(
            expect.objectContaining({
              id: 1,
              loan_id: loan.id,
              collateral_currency_id: 2,
              collateral_amount: '100000',
              collateral_value: '10000',
              transaction_id: '123',
              response: expect.objectContaining({
                id: '123',
                status: 'completed',
                averagePrice: '10000',
                filledQuantity: '100000'
              }),
              liquidation_value: 1000000000
            })
          )

          expect(marginCallPublisher.publishUpdatedAndNotifyLoan).toBeCalledTimes(1)
        })
      })
    })
  })
})
