Feature: Load Shedding
  As an operator
  I want the API to reject requests when the event loop is saturated
  So that the application can recover rather than crash

  Scenario: Service Unavailable under pressure
    Given the API is running
    When the event loop is artificially blocked
    And the client sends a GET request to "/health"
    Then the response status is 503
    And the response body field "message" is "Service Unavailable"
