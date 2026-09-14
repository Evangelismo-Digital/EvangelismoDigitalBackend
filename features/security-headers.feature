Feature: Security Headers
  As a security-conscious operator
  I want all API responses to include modern security headers
  So that browsers and clients are protected against common vulnerabilities

  Scenario: Responses include Helmet security headers
    Given the API is running
    When the client sends a GET request to "/health"
    Then the response status is 200
    And the response includes the "content-security-policy" header
    And the response includes the "x-frame-options" header
    And the response includes the "x-content-type-options" header
