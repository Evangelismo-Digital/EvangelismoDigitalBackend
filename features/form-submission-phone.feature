Feature: Phone number on the evangelism form
  As the team that follows up on each form
  I want the submitter's phone number when they choose to give one
  So that we can call or message them, not only send an e-mail

  Scenario: A masked Brazilian phone is accepted and kept as digits
    Given the API is running
    When the client submits the form with phone "(21) 98765-4321"
    Then the response status is 201
    And the submission was recorded with phone "21987654321"

  Scenario: The phone is optional
    Given the API is running
    When the client submits the form without a phone
    Then the response status is 201
    And the submission was recorded without a phone

  Scenario: A phone that is not a Brazilian number with its area code is refused
    Given the API is running
    When the client submits the form with phone "(20) 1234-5678"
    Then the response status is 400
    And nothing was recorded
