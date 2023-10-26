export const config = {
  services: {
    timeout: 10000,
    lending: {
      host: process.env.LENDING_API_HOST || 'http://lending-api:8080/api/v1/lending'
    }
  }
}
