## Performance Ttesting Tool

#### Overview
The tool that generate definition files to launching microgateway in different ways. 
Then, the performance test can send the traffic to test different microgateway configuration setting. 


#### configurations that can be set
User can set following configurations in `perf_config` file
- number of apis
- number of pathes of each apis
- if the security option is enabled or not
- if the ratelimit is set for each apis or not

#####  Example of `perf_config`
```
{
  "apis" : 2,
  "paths" : 3,
  "security" : true,
  "ratelimit" : true
}
```


#### CURL command Examples
- security enabled
```
    curl -H "X-IBM-Client-Id:2609421b-4a69-40d7-8f13-44bdf3edd18f" -d@payload.txt localhost:3000/api001_base/path01
```