import {BitgoMarketService, BitgoWalletInterface, BitgoWalletService, LoanPublisher, MarginCallPublisher, PrismaService} from '@frnt/apps/lending-api/shared'
import {BitgoWebhookService} from '../../src/app/resources/loans/bitgo-webhook-service'
import {CollateralWithrawalPublisher} from '../../src/app/publishers/collateral-withrawal-publisher'
import {Test, TestingModule} from '@nestjs/testing'
import {AppModule} from '../../src/app/app.module'
import {mock} from 'jest-mock-extended'
import {INestApplication} from '@nestjs/common'
import {getLoan, getToken, insertDeposit, insertWithdrawal} from '@frnt/apps/lending-api/support'
import {Scopes} from '@frnt/shared/util/permissions'
import request from 'supertest'
import {LiquidationConsumer} from '../../src/app/resources/loans/consumers/liquidation.consumer'
import BigNumber from 'bignumber.js'

const USER_ID = 'e9fba5db-e4da-45a2-9cfd-612e5117bdbe'

describe('EventsController (e2e)', () => {
  let app: INestApplication

  let bitgoWalletService: BitgoWalletInterface
  let bitgoWebhookService: BitgoWebhookService
  let withdrawalPublisher: CollateralWithrawalPublisher
  let bitgoMarketService: BitgoMarketService
  let prismaService: PrismaService
  let loanPublisher: LoanPublisher
  let marginCallPublisher: MarginCallPublisher

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      providers: []
    })
      .overrideProvider(BitgoWalletService)
      .useValue(mock<BitgoWalletInterface>())
      .overrideProvider(BitgoWebhookService)
      .useValue(mock<BitgoWebhookService>())
      .overrideProvider(CollateralWithrawalPublisher)
      .useValue(mock<CollateralWithrawalPublisher>())
      .overrideProvider(LoanPublisher)
      .useValue(mock<LoanPublisher>())
      .overrideProvider(LiquidationConsumer)
      .useValue(mock<LiquidationConsumer>())
      .overrideProvider(BitgoMarketService)
      .useValue(mock<BitgoMarketService>())
      .overrideProvider(MarginCallPublisher)
      .useValue(mock<MarginCallPublisher>())
      .compile()

    app = moduleFixture.createNestApplication()
    await app.init()

    bitgoWalletService = app.get(BitgoWalletService)
    bitgoWebhookService = app.get(BitgoWebhookService)
    withdrawalPublisher = app.get(CollateralWithrawalPublisher)
    bitgoMarketService = app.get(BitgoMarketService)
    prismaService = app.get(PrismaService)
    loanPublisher = app.get(LoanPublisher)
    marginCallPublisher = app.get(MarginCallPublisher)

    bitgoWebhookService.createWebhook = jest.fn().mockResolvedValue({data: {}})
    withdrawalPublisher.publishCreated = jest.fn().mockResolvedValue({})

    bitgoMarketService.placeMarketOrder = jest.fn().mockResolvedValue({data: {id: 'trade_id', status: 'pending_open'}})
    bitgoMarketService.getOrder = jest.fn().mockResolvedValue({data: {status: 'completed', filledQuantity: '0.0001', averagePrice: '50000', id: 'transaction_id'}})

    loanPublisher.publishUpdated = jest.fn().mockResolvedValue({})
    loanPublisher.publishCreated = jest.fn().mockResolvedValue({})
    marginCallPublisher.publishCreatedAndNotifyLoan = jest.fn().mockResolvedValue({})
    marginCallPublisher.publishUpdatedAndNotifyLoan = jest.fn().mockResolvedValue({})
  })

  afterEach(async () => {
    await app.close()

    await prismaService.$executeRaw`TRUNCATE TABLE loans CASCADE;`
  })

  it('should return sorted events', async () => {
    const token = getToken(USER_ID, [Scopes.ADMIN])
    bitgoWalletService.generateNewAddress = jest.fn().mockResolvedValue({address: 'test'})
    await prismaService.collateralCurrency.updateMany({data: {price: 50000}})

    const {body: loan} = await request(app.getHttpServer()).post('/loans').send(getLoan()).set('Authorization', token).expect(201)
    await prismaService.collateralWalletBalance.updateMany({data: {balance: '100000', converted_value: new BigNumber(100000).div(Math.pow(10, 8)).times(50000).toNumber()}})
    await request(app.getHttpServer()).patch(`/loans/${loan.id}`).send({is_active: true}).set('Authorization', token).expect(200)
    await insertDeposit(loan.id)
    await insertWithdrawal(loan.id)
    const {body: marginCall} = await request(app.getHttpServer()).post(`/loans/${loan.id}/margin-calls`).send({is_warning: true}).set('Authorization', token).expect(201)
    const {body: marginCall2} = await request(app.getHttpServer()).post(`/loans/${loan.id}/margin-calls`).send({is_warning: true}).set('Authorization', token).expect(201)
    const {body: liquidation} = await request(app.getHttpServer())
      .post(`/loans/${loan.id}/liquidations`)
      .send({collateral_currency_code: 'TBTC', margin_call_id: marginCall.id, amount: 1000})
      .set('Authorization', token)
      .expect(201)
    const {body: events} = await request(app.getHttpServer()).get(`/loans/${loan.id}/events`).set('Authorization', token).expect(200)
    expect(events).toStrictEqual([
      expect.objectContaining({
        loan_id: loan.id,
        event: 'MarginCallLiquidation',
        currency: 'TBTC',
        amount: '10000'
      }),
      expect.objectContaining({
        loan_id: loan.id,
        event: 'CollateralWarning1Hours',
        currency: '',
        amount: '0'
      }),
      expect.objectContaining({
        loan_id: loan.id,
        event: 'CollateralWarning24Hours',
        currency: '',
        amount: '0'
      }),
      expect.objectContaining({
        loan_id: loan.id,
        event: 'CollateralWithdrawal',
        currency: 'TBTC',
        amount: '10000'
      }),
      expect.objectContaining({
        loan_id: loan.id,
        event: 'CollateralDeposit',
        currency: 'TBTC',
        amount: '120000'
      }),
      expect.objectContaining({
        loan_id: loan.id,
        event: 'LoanActivated',
        currency: 'USD',
        amount: '0'
      }),
      expect.objectContaining({
        loan_id: loan.id,
        event: 'LoanCreated',
        currency: 'USD',
        amount: '1000'
      })
    ])

    const updatedMarginCall = await prismaService.marginCall.findFirst({
      where: {id: liquidation.id},
      include: {margin_call_liquidation_events: {include: {liquidation_event: true}}}
    })

    expect(updatedMarginCall.margin_call_liquidation_events).toHaveLength(1)
    expect(updatedMarginCall.margin_call_liquidation_events[0].liquidation_event).toStrictEqual(
      expect.objectContaining({
        loan_id: loan.id,
        collateral_currency_id: 2,
        collateral_amount: '0.0001',
        collateral_value: '50000',
        transaction_id: 'transaction_id',
        response: {
          id: 'transaction_id',
          status: 'completed',
          averagePrice: '50000',
          filledQuantity: '0.0001'
        },
        liquidation_value: 5
      })
    )
  })
})
