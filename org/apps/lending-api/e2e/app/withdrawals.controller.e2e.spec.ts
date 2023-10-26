import {Test, TestingModule} from '@nestjs/testing'
import request from 'supertest'
import {AppModule} from '../../src/app/app.module'
import {Scopes} from '@frnt/shared/util/permissions'
import {INestApplication} from '@nestjs/common'
import {getLoan, getPendingVideoApprovalBitgoWithdrawalResponse, getSuccessfullWithdrawalBitgoResponse, getToken} from '@frnt/apps/lending-api/support'
import {mock} from 'jest-mock-extended'
import {BitgoWalletInterface, BitgoWalletService, LoanPublisher, PrismaService} from '@frnt/apps/lending-api/shared'
import {BitgoWebhookService} from '../../src/app/resources/loans/bitgo-webhook-service'
import {CollateralWithrawalPublisher} from '../../src/app/publishers/collateral-withrawal-publisher'

const USER_ID = 'e9fba5db-e4da-45a2-9cfd-612e5117bdbe'

describe('WithdrawalsController (e2e)', () => {
  let app: INestApplication
  let prismaService: PrismaService
  let bitgoWalletService: BitgoWalletInterface
  let bitgoWebhookService: BitgoWebhookService
  let withdrawalPublisher: CollateralWithrawalPublisher
  let loanPublisher: LoanPublisher

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
      .overrideProvider(CollateralWithrawalPublisher)
      .useValue(mock<CollateralWithrawalPublisher>())
      .overrideProvider(LoanPublisher)
      .useValue(mock<LoanPublisher>())
      .compile()

    app = moduleFixture.createNestApplication()
    await app.init()

    prismaService = app.get(PrismaService)
    bitgoWalletService = app.get(BitgoWalletService)
    bitgoWebhookService = app.get(BitgoWebhookService)
    withdrawalPublisher = app.get(CollateralWithrawalPublisher)
    loanPublisher = app.get(LoanPublisher)

    bitgoWebhookService.createWebhook = jest.fn().mockResolvedValue({data: {}})
    withdrawalPublisher.publishCreatedAndNotifyLoan = jest.fn().mockResolvedValue({})
    loanPublisher.publishUpdated = jest.fn().mockResolvedValue({})
    loanPublisher.publishCreated = jest.fn().mockResolvedValue({})
  })

  afterEach(async () => {
    await app.close()

    await prismaService.$executeRaw`TRUNCATE TABLE loans CASCADE;`
  })

  describe('/loan/:id/withdrawals (POST) create', () => {
    const token: string = getToken(USER_ID, [Scopes.ADMIN])
    let loan
    beforeEach(async () => {
      bitgoWalletService.generateNewAddress = jest.fn().mockResolvedValue({address: 'test'})

      loan = await request(app.getHttpServer())
        .post('/loans')
        .send({...getLoan(), is_overcollateralized: true})
        .set('Authorization', token)
        .expect(201)

      await prismaService.loan.update({
        where: {id: loan.body.id},
        data: {collateral_value_total: 2000, is_active: true}
      })
      await prismaService.collateralWalletBalance.update({
        where: {id: loan.body.collateral_wallet_balances[0].id},
        data: {balance: '100000000'}
      })
      await prismaService.collateralWalletWhitelistedAddresses.create({
        data: {
          address: 'test',
          collateral_currency_id: 2,
          loan_id: loan.body.id
        }
      })
    })

    describe('When goes to pendingVideoApproval', () => {
      it('should succeed', async () => {
        bitgoWalletService.withdrawCollateral = jest.fn().mockResolvedValue(getPendingVideoApprovalBitgoWithdrawalResponse())

        const {body: createdWithdrawal} = await request(app.getHttpServer())
          .post(`/loans/${loan.body.id}/withdrawals`)
          .send({address: 'test', amount: '10000'})
          .set('Authorization', token)
          .expect(201)

        expect(withdrawalPublisher.publishCreatedAndNotifyLoan).toBeCalledTimes(1)

        expect(createdWithdrawal).toEqual(
          expect.objectContaining({
            loan_id: loan.body.id,
            collateral_currency_id: 2,
            amount: '10000',
            address: 'test',
            response: [getPendingVideoApprovalBitgoWithdrawalResponse().data],
            state: 'pendingVideoApproval'
          })
        )

        const {body: withdrawal} = await request(app.getHttpServer()).get(`/loans/${loan.body.id}/withdrawals`).set('Authorization', token).expect(200)
        expect(withdrawal.length).toEqual(1)
        expect(withdrawal[0]).toEqual(
          expect.objectContaining({
            loan_id: loan.body.id,
            collateral_currency_id: 2,
            amount: '10000',
            address: 'test',
            response: [getPendingVideoApprovalBitgoWithdrawalResponse().data],
            state: 'pendingVideoApproval'
          })
        )

        const {body: updatedWithdrawal} = await request(app.getHttpServer())
          .patch(`/loans/${loan.body.id}/withdrawals/${createdWithdrawal.id}`)
          .send({state: 'sent'})
          .set('Authorization', token)
          .expect(200)
        expect(updatedWithdrawal).toEqual(
          expect.objectContaining({
            state: 'sent'
          })
        )
      })
    })

    describe('without video approval', () => {
      it('should succeed', async () => {
        bitgoWalletService.withdrawCollateral = jest.fn().mockResolvedValue(getSuccessfullWithdrawalBitgoResponse())

        const {body: createdWithdrawal} = await request(app.getHttpServer())
          .post(`/loans/${loan.body.id}/withdrawals`)
          .send({address: 'test', amount: '10000'})
          .set('Authorization', token)
          .expect(201)

        expect(createdWithdrawal).toEqual(
          expect.objectContaining({
            loan_id: loan.body.id,
            collateral_currency_id: 2,
            amount: '10000',
            address: 'test',
            response: [getSuccessfullWithdrawalBitgoResponse().data],
            state: 'signed'
          })
        )
      })
    })
  })
})
