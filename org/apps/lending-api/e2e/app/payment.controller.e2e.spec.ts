import {Test, TestingModule} from '@nestjs/testing'
import request from 'supertest'
import {AppModule} from '../../src/app/app.module'
import {Scopes} from '@frnt/shared/util/permissions'
import {INestApplication} from '@nestjs/common'
import {getLoan, getToken} from '@frnt/apps/lending-api/support'
import {mock} from 'jest-mock-extended'
import {BitgoWalletInterface, BitgoWalletService, PrismaService} from '@frnt/apps/lending-api/shared'
import {CreatePaymentDto} from '../../src/app/resources/payments/dto/create-payment.dto'
import _ from 'lodash'
import {BitgoWebhookService} from '../../src/app/resources/loans/bitgo-webhook-service'
import PaymentPublisher from '../../src/app/publishers/payment.publisher'

const USER_ID = 'e9fba5db-e4da-45a2-9cfd-612e5117bdbe'

describe('PaymentsController (e2e)', () => {
  let app: INestApplication
  let bitgoWalletService: BitgoWalletInterface
  let prismaService: PrismaService
  let bitgoWebhookService: BitgoWebhookService
  let paymentPublisher: PaymentPublisher

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      providers: []
    })
      .overrideProvider(BitgoWalletService)
      .useValue(mock<BitgoWalletInterface>())
      .overrideProvider(BitgoWebhookService)
      .useValue(mock<BitgoWebhookService>())
      .overrideProvider(PaymentPublisher)
      .useValue(mock<PaymentPublisher>())
      .compile()

    app = moduleFixture.createNestApplication()
    await app.init()

    bitgoWalletService = app.get(BitgoWalletService)
    prismaService = app.get(PrismaService)
    bitgoWebhookService = app.get(BitgoWebhookService)
    paymentPublisher = app.get(PaymentPublisher)

    bitgoWebhookService.createWebhook = jest.fn().mockResolvedValue({data: {}})
    paymentPublisher.publishCreatedAndNotifyLoan = jest.fn().mockResolvedValue({})
  })

  afterEach(async () => {
    await app.close()

    await prismaService.$executeRaw`TRUNCATE TABLE loans CASCADE;`
  })

  describe('/payments (POST) create', () => {
    it('should succeed', async () => {
      const token = getToken(USER_ID, [Scopes.ADMIN])
      bitgoWalletService.generateNewAddress = jest.fn().mockResolvedValue({address: 'test'})

      const loan = await request(app.getHttpServer()).post('/loans').send(getLoan()).set('Authorization', token).expect(201)

      const interestSchedule = await prismaService.interestSchedule.findMany()

      const createPaymentDto: CreatePaymentDto = {
        loan_id: loan.body.id,
        amount: 120,
        interest_schedule_id: interestSchedule[0].id,
        date: new Date(),
        payment_id: 'test'
      }
      const payment = await request(app.getHttpServer()).post('/payments').send(createPaymentDto).set('Authorization', token).expect(201)
      expect(payment.body).toMatchObject(_.omit(createPaymentDto, ['date']))

      const updatedInterestSchedule = await prismaService.interestSchedule.findMany()
      expect(_.sortBy(updatedInterestSchedule, 'id')[0].is_paid).toBe(true)
      expect(paymentPublisher.publishCreatedAndNotifyLoan).toBeCalledTimes(1)
    })
  })
})
