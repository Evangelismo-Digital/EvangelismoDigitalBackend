Feature: Routing mode for the nearest churches
  As a person looking for a church near my CEP
  I want to say whether I am walking or travelling by vehicle
  So that the distances and the distance limit match how I will get there

  Scenario: Walking is the default
    Given the API is running
    When the client asks for the nearest churches to CEP "24020-000" without a mode
    Then the response status is 200
    And the churches were routed for "pedestrian"
    And the response body field "mode" is "pedestrian"

  Scenario: The client chooses transport
    Given the API is running
    When the client asks for the nearest churches to CEP "24020-000" with mode "transport"
    Then the response status is 200
    And the churches were routed for "transport"
    And the response body field "mode" is "transport"

  Scenario: An unknown mode is rejected
    Given the API is running
    When the client asks for the nearest churches to CEP "24020-000" with mode "bicycle"
    Then the response status is 400
    And no routing was attempted
