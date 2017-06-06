# Introduction

The Microgateway is an developer-focused, extensible gateway framework written
in Node.js for enforcing access to Microservices & APIs - https://developer.ibm.com/apiconnect/. It supports the
following core features:

*	Secure and control access to APIs using Swagger (OpenAPI) Specification
*	Collection of pre-built gateway policies for API Key validation, OAuth 2.0,
    rate limiting, and JavaScript
*	Create gateway policies (security, routing, integration, etc... ) using
    Swagger extensions (API Assembly)
*	Simple interfaces for creating your own gateway policies.

The role of a Gateway in an API architecture is to protect, enrich and
control access to API services. These sets of capabilities are often related
to security and rate limiting, but it also includes the ability to do deeper
message inspection.  For example, you may want to insure that the message
received is properly formed JSON, XML, or data following your own specific
format.  In addition, the Gateway can modify the payload or transform it to
meet old or new interfaces for the API backend. Finally, the Gateway can
invoke multiple services and aggregate responses from multiple API backends.

The Microgateway is the foundation for all of those things. It is optimized
to perform security, rate limiting, and much more complex packet processing
through a highly flexible flow-engine.

The flow-engine is a processing unit that allows you to define a sequence
of processing policies or tasks that get applied to the transaction as it
passes through the Gateway for a specific API. These policies may be organized
in a linear fashion, executing in sequential order. Or, they may have
conditional logic deciding which set of policies will execute depending on
variables that are part of the API flow.

The Microgateway currently contains the following policies that run implicitly
based on swagger definitions:

* **Client_ID/Client_Secret** – Use a client ID and client secret to
  authenticate and authorize the use of this API
* **Basic Auth** – Use Basic Auth to authenticate and authorize the use of this
  API
* **OAuth 2.0** – Use OAuth2.0 to authenticate and authorize the use of this API
* **Rate-Limit** – Limit the number of requests per time unit that the
  subscriber may access this API

The Microgateway currently contains the following polices that are available
to the Assembly extension to the swagger definition:

* **if**  - If a condition evaluates to True, execute the corresponding flow.
* **switch** – Given a set of conditions, execute the flow corresponding to the
  first condition that evaluates to True.
* **operation-switch** – Given a set of conditions on the operation, select the
  first rule where the condition evaluates to True.
* **throw** – Throw an exception
* **invoke** – Retrieve a resource using HTTP or HTTPS
* **javascript** – Execute a JavaScript program to manipulate or inspect the
  transaction
* **set-variable** – Set a variable in the context

# API Designer Toolkit

The API Designer toolkit provides a graphical interface for the Microgateway.
You can download it using NPM via `npm install -g apiconnect`. This toolkit can
be also be used for creating enterprise API definitions using IBM API Connect,
which provides features to create and manage APIs on an enterprise scale.

For more information, see https://developer.ibm.com/apiconnect/.

The API designer toolkit creates YAML files for the APIs definitions. These can
then be tested directly on the internal Microgateway (part of the API Designer
toolkit), or you can run them on an external Microgateway by moving the
underlying YAML files to the external Microgateway directory.

# The Microgateway Architecture

The Microgateway was developed with the goal of making something simple,
community-based, and that could easily be extended for anyone’s needs.

The Microgateway has the following characteristics:

* Built on Node Express and Loopback frameworks
* Processes Swagger API definitions via a middleware chain that identifies the
  API and executes the API definition.
* Contains a “datastore” that holds the data model of all API artifacts to be
  processed.
* Uses a flow-engine to process a variety of policies giving the API designer
  the ability to perform deep packet processing on the request or response.

A diagram of the Microgateway is shown below. Looking at the diagram, the flow
of a request is from left to right.  The Microgateway is a collection of
middleware components that process the request in order. Each middleware
component passes control to the next middleware until the processing of the
request is complete.  The **postflow** and **error-handler** middlewares work
together to return the results back to the client making the request.

![alt text][microgateway-components]

[microgateway-components]: https://github.com/strongloop/microgateway/blob/master/images/readme/MicroGatewayArchitecture2.png "Microgateway Component Structure"

The **urlrewrite** middleware simply modifies the prefix of the URL under
certain conditions.  For the most part, this is a passthrough.

The **context** middleware creates a scratchpad memory area known as the
context. The context is accessible by all middlewares and policies in the flow.
Any middleware or policy can add, modify or remove variables from the context.

Here are some of the context variables that are automatically populated:

![alt text][context-variables-part1]

[context-variables-part1]: https://github.com/strongloop/microgateway/blob/master/images/readme/ContextVariablesPart1.png "Microgateway Context Variables"

One object that is particularly important is the **message** object. The
**message** object contains the payload that was received from a request. For
example, if you add an **invoke** action, the results from that action will be
placed in the **message** object. At the end of the flow, the contents of the
**message** object will be returned back to the client.

Here are some other context variables:

![alt text][context-variables-part2]

[context-variables-part2]: https://github.com/strongloop/microgateway/blob/master/images/readme/ContextVariablesPart2.png "Microgateway Context Variables"

The **request** object is another important object. It holds all of the
information about the original request that was received by the Microgateway.
There are other objects that contain system information, plan information, and
general API information.

One important aspect of the context is that it is read-writable by policies and
middleware as they execute. Another important factor is that context variables
can be used as substitution parameters inside the conditional policies. This
allows you to write sophisticated logic flows, simply referencing them through
configuration.

The **analytics** middleware is used to connect to an external analytics engine.
It passes a series of variables from the context in a message to an external
collection device.

The preflow middleware accomplishes the following:

1.	Identifies the API (or Swagger definition) to execute.
2.	Performs security associated with that Swagger definition.
3.	Performs rate-limiting for the API.
4.	Creates the objects necessary for the assembly (IBM extensions to the
swagger definition) to be consumed by the flow-engine.

The flow-engine is a combinational processor that allows you to insert
sequential logic around a series of policies. The policies can perform any
operation to the request or response payload. They can be used to retrieve a
response from an API backend or examine the request for security or other needs.

The flow-engine is built as a vendor extension to the standard Swagger
specification. The policies that are referenced in the assembly must have a
pre-built policy. Each one of the policies is a Node.js module that provides the
processing of the message. Each policy also has a policy.yml file that defines
the set of properties and behavior of the policy. For examples, visit the
`policies` directory of the microgateway repository.


# Getting Started with the Microgateway
Following are the steps to install and run a stand alone microgateway

Step 1. Clone the microgateway repository
```
cd $HOME
git clone https://github.com/strongloop/microgateway.git
```

Step 2. Populate all of the necessary dependencies for the project
```
cd $HOME/microgateway
npm install
```

Step 3. Change current working directory to the root directory
```
cd $HOME/microgateway/
```

Step 4. Create a startup script that sets environment variables and starts up
the Microgateway. The script file is a simple node.js JavaScript file shown
below. Create this file in the `$HOME/microgateway/` directory.

Note:  The CONFIG_DIR is the folder containing the yaml files holding the API
definitions that you wish to enforce.
```
// sample.js
//
'use strict';

var mg = require('../lib/microgw');
var fs = require('fs');

// config dir
process.env.CONFIG_DIR = __dirname + '/definitions/myapp';
process.env.NODE_ENV = 'production';
mg.start(3000);
```

Step 4. Create a yaml file to define the API. Place the yaml file in the folder
identified by the `CONFIG_DIR` environment variable created in the startup script.
For this example, we are creating the file sample_1.0.0.yaml in the
`$HOME/microgateway/definitions/myapp` directory. Note that you can place
several yaml files in this directory and all will be pulled in and used by the
Microgateway.
```
# sample_1.0.0.yaml
#
info:
  version: 1.0.0
  title: sample
  description: sample laptop yaml
basePath: /sample
swagger: '2.0'
paths:
  /echo:
    get:
      responses:
        '200':
          description: 200 OK
x-ibm-configuration:
  assembly:
    execute:
      - javascript:
          title: write a small json object
          source: |
           message.body = { text : 'Hello World' };
schemes:
  - http
```

Step 5. From the root directory, execute the command to start the Microgateway.
```
cd $HOME/microgateway/
node sample.js
```

Step 6. Send a curl command to test the API. It should return the
`{“text”:”Hello World”}` JSON object.
```
curl http://localhost:3000/sample/echo
```

For more information on the internal specifics of the Microgateway, you may
want to look at the microgateway/test directory. All middleware components
have one or more test suites to exercise their interfaces and logic.

For more examples on how to add various policies to your API assembly, look in
the microgateway/test/definitions directory. There are several swagger files
that are used to test out the implementation.

# How to contribute to this Project

For information on contribuging to this project, please look at CONTRIBUTING.md
and CONDUCT.md as well as the LICENSE.txt file.


