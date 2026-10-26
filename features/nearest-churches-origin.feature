Feature: Where the route to the nearest churches starts
  As a person who searched for churches near my CEP
  I want the answer to say which point the distances were measured from
  So that "Como chegar" draws the route from my CEP, not from wherever my phone happens to be

  Scenario: The answer carries the point the CEP resolved to
    Given the API is running
    When the client asks for the nearest churches to CEP "24230-100"
    Then the response status is 200
    And the response origin is latitude "-22.9035" and longitude "-43.1098"

  Scenario: No origin is invented when the CEP does not exist
    Given the API is running
    When the client asks for the nearest churches to CEP "00000-000"
    Then the response status is 404
    And the response has no origin
