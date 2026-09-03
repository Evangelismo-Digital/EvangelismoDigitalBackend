Feature: Health check endpoint
  As an operator of the Evangelismo Digital API
  I want a health endpoint that reports service and database status
  So that load balancers and monitoring can route traffic safely

  Scenario: Reports ok when the database is reachable
    Given the API is running
    When the client sends a GET request to "/health"
    Then the response status is 200
    And the response body field "status" is "ok"
    And the response body has an "uptime" field
